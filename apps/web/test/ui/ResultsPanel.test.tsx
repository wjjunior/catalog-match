import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MatchResponse } from '../../src/shared/api/client';
import { ResultsPanel } from '../../src/widgets/results-panel/ResultsPanel';
import { alternative, customer, explanation, match, note, response } from './fixtures';

let fetchMock: ReturnType<typeof vi.fn>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function serve(matchResponse: MatchResponse | ((init?: RequestInit) => Promise<Response>)) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/customers')) return Promise.resolve(json([customer()]));
    return typeof matchResponse === 'function'
      ? matchResponse(init)
      : Promise.resolve(json(matchResponse));
  });
}

const limitOf = (init?: RequestInit): number =>
  (JSON.parse(String(init?.body)) as { limit?: number }).limit ?? 3;

async function submit(query: string) {
  await userEvent.type(screen.getByRole('textbox', { name: /query/i }), query);
  await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));
}

function matchBodies(): Record<string, unknown>[] {
  return fetchMock.mock.calls
    .filter(([url]) => url === '/api/match')
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);
}

function matchBody(): Record<string, unknown> {
  return matchBodies()[0] ?? {};
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ResultsPanel', () => {
  it('invites a query before anything has been asked', () => {
    serve(response());
    render(<ResultsPanel />);

    expect(screen.getByText(/pick an example/i)).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('shows the single card of a unique match', async () => {
    serve(response({ status: 'unique', compatibleCount: 1, results: [match()] }));
    render(<ResultsPanel />);

    await submit('M8 x 16 hex cap screw');

    expect(await screen.findByText('1 compatible item')).toBeDefined();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(matchBody()).toEqual({ query: 'M8 x 16 hex cap screw' });
  });

  it('shows a tie as a count, the attributes that would settle it, and every card returned', async () => {
    serve(
      response({
        query: 'M12 hex nut',
        status: 'ambiguous',
        compatibleCount: 9,
        results: [
          match({
            sku: 'PXNUT1216STZC0005',
            explanation: explanation({ disambiguateBy: ['material', 'finish'] }),
          }),
          match({ sku: 'PXNUT12188PL0617' }),
          match({ sku: 'PXNUT1216BRZC0072' }),
        ],
      }),
    );
    render(<ResultsPanel />);

    await submit('M12 hex nut');

    expect(await screen.findByText('9 compatible items')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe(
      'Specify material or finish to narrow these down.',
    );
    expect(screen.getAllByRole('article')).toHaveLength(3);
  });

  it('follows the match of a unique answer with the near misses under their own heading', async () => {
    serve(
      response({
        query: 'M8 flat washer DIN 912',
        status: 'unique',
        compatibleCount: 1,
        results: [match()],
        alternatives: [
          alternative({ sku: 'PXWASH812A2YZ0016', relaxed: ['standard'] }),
          alternative({ sku: 'PXWASH82536HG0974', relaxed: ['standard'] }),
        ],
      }),
    );
    render(<ResultsPanel />);

    await submit('M8 flat washer DIN 912');

    const matches = await screen.findByRole('region', { name: 'Matches' });
    const alternatives = screen.getByRole('region', { name: 'Alternatives' });

    expect(within(matches).getAllByRole('article')).toHaveLength(1);
    expect(within(alternatives).getAllByRole('article')).toHaveLength(2);
  });

  it('never announces a near miss as a match', async () => {
    serve(
      response({
        status: 'unique',
        compatibleCount: 1,
        results: [match({ sku: 'PXWASH88088PL0688', confidence: 0.98, label: 'High' })],
        alternatives: [alternative({ sku: 'PXWASH812A2YZ0016', relaxed: ['standard'] })],
      }),
    );
    render(<ResultsPanel />);

    await submit('M8 flat washer DIN 912');

    const alternatives = await screen.findByRole('region', { name: 'Alternatives' });
    const near = within(alternatives).getByRole('article');

    expect(within(alternatives).queryByText('PXWASH88088PL0688')).toBeNull();
    expect(within(near).getByText('PXWASH812A2YZ0016')).toBeDefined();
    expect(within(near).getByText('Closeness')).toBeDefined();
    expect(within(near).getByText('relaxed: standard')).toBeDefined();
    expect(within(near).queryByText(/confidence/i)).toBeNull();
    expect(within(near).queryByText('High')).toBeNull();
  });

  it('explains an empty compatible set and offers the alternatives under their own heading', async () => {
    serve(
      response({
        query: 'M8 x 45mm SHCS',
        status: 'none',
        compatibleCount: 0,
        results: [],
        alternatives: [alternative()],
        notes: [note('failedConstraint', 'no M8 socket head cap screw at 45 mm')],
      }),
    );
    render(<ResultsPanel />);

    await submit('M8 x 45mm SHCS');

    expect(await screen.findByText('no M8 socket head cap screw at 45 mm')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'No compatible items' })).toBeDefined();
    const alternatives = screen.getByRole('region', { name: /alternatives/i });
    expect(within(alternatives).getAllByRole('article')).toHaveLength(1);
    expect(within(alternatives).getByText('relaxed: length')).toBeDefined();
  });

  it('never invents a nearby size when the catalog has no alternative to offer', async () => {
    serve(
      response({
        query: 'M14 hex nut',
        status: 'none',
        compatibleCount: 0,
        results: [],
        alternatives: [],
        notes: [note('unknownDiameter', 'M14 is not a diameter in this catalog')],
      }),
    );
    render(<ResultsPanel />);

    await submit('M14 hex nut');

    expect(screen.getByRole('heading', { name: 'No compatible items' })).toBeDefined();
    expect(await screen.findByText('M14 is not a diameter in this catalog')).toBeDefined();
    expect(screen.queryByRole('region', { name: /alternatives/i })).toBeNull();
    expect(screen.queryByText(/M10|M12|M16/)).toBeNull();
  });

  it('asks for a customer when a history reference arrives without one', async () => {
    serve(
      response({
        query: 'the same washers as last time',
        status: 'history',
        compatibleCount: 0,
        notes: [note('customerRequired', "select a customer to resolve 'last time'")],
      }),
    );
    render(<ResultsPanel />);

    await submit('the same washers as last time');

    expect(await screen.findByText("select a customer to resolve 'last time'")).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('sends the chosen customer and renders what history contributed', async () => {
    serve(
      response({
        query: 'the same washers as last time',
        status: 'history',
        compatibleCount: 0,
        results: [
          match({
            explanation: explanation({
              personalization: { reason: 'history prefers 18-8 SS plain', prior: 0.61 },
            }),
          }),
        ],
        notes: [note('historyReference', 'based on your 2025-08-12 order')],
      }),
    );
    render(<ResultsPanel />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    await userEvent.click(await screen.findByRole('option'));
    await submit('the same washers as last time');

    expect(
      await screen.findByText("items from this customer's order history, most recent first"),
    ).toBeDefined();
    expect(matchBody()).toEqual({
      query: 'the same washers as last time',
      customerId: 'CUST-003',
    });
    expect(screen.getByText(/history prefers 18-8 SS plain/)).toBeDefined();
    expect(screen.getByText('based on your 2025-08-12 order')).toBeDefined();
  });

  it('keeps the note out of the list once the status line has said it', async () => {
    serve(
      response({
        status: 'none',
        compatibleCount: 0,
        notes: [note('failedConstraint', 'no M8 socket head cap screw at 45 mm')],
      }),
    );
    render(<ResultsPanel />);

    await submit('M8 x 45mm SHCS');

    await screen.findByText('no M8 socket head cap screw at 45 mm');
    expect(screen.getAllByText('no M8 socket head cap screw at 45 mm')).toHaveLength(1);
  });

  it('does not call a pool it could not rank an empty one', async () => {
    serve(
      response({
        query: 'stainless',
        status: 'unparsed',
        compatibleCount: 438,
        results: [],
        notes: [
          note(
            'unrankedPool',
            'stainless leaves 438 items compatible and nothing ranks them; name a diameter or a type',
          ),
        ],
      }),
    );
    render(<ResultsPanel />);

    await submit('stainless');

    expect(
      await screen.findByText(
        'stainless leaves 438 items compatible and nothing ranks them; name a diameter or a type',
      ),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Nothing to rank' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'No compatible items' })).toBeNull();
  });

  it('says a query could not be parsed', async () => {
    serve(response({ query: 'zzz qqq', status: 'unparsed', compatibleCount: 0 }));
    render(<ResultsPanel />);

    await submit('zzz qqq');

    expect(await screen.findByText('could not parse that query')).toBeDefined();
  });

  it('reports a failing route without pretending it has results', async () => {
    serve(() => Promise.resolve(json({ error: 'boom' }, 500)));
    render(<ResultsPanel />);

    await submit('M12 hex nut');

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.queryByRole('article')).toBeNull();
    // A failed request is not an empty result: only one of the two headings may appear.
    expect(screen.queryByRole('heading', { name: 'No compatible items' })).toBeNull();
  });

  it('reports a route it cannot reach at all', async () => {
    serve(() => Promise.reject(new TypeError('network down')));
    render(<ResultsPanel />);

    await submit('M12 hex nut');

    expect((await screen.findByRole('alert')).textContent).toContain('could not be reached');
  });

  it('retries the last query, with whichever customer is selected now', async () => {
    let attempt = 0;
    serve(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('network down'))
        : Promise.resolve(
            json(response({ status: 'unique', compatibleCount: 1, results: [match()] })),
          );
    });
    render(<ResultsPanel />);

    await submit('M12 hex nut');
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('1 compatible item')).toBeDefined();
    expect(matchBody()).toEqual({ query: 'M12 hex nut' });
    expect(attempt).toBe(2);
  });

  it('sketches the summary and result cards while a match is in flight, and keeps the search card usable', async () => {
    let release: (() => void) | undefined;
    serve(
      () =>
        new Promise<Response>((resolve) => {
          release = () => {
            resolve(json(response({ status: 'unique', compatibleCount: 1, results: [match()] })));
          };
        }),
    );
    const { container } = render(<ResultsPanel />);

    await submit('M12 hex nut');

    expect(screen.getByText('Matching…')).toBeDefined();
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    expect((screen.getByRole('textbox', { name: /query/i }) as HTMLInputElement).disabled).toBe(
      false,
    );
    expect(screen.getByRole('combobox', { name: /customer/i })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Match catalog' }).hasAttribute('disabled')).toBe(
      true,
    );

    release?.();
    expect(await screen.findByText('1 compatible item')).toBeDefined();
  });

  it('never sends a customer the combobox no longer shows', async () => {
    serve(response({ status: 'unique', compatibleCount: 1, results: [match()] }));
    render(<ResultsPanel />);

    const combobox = screen.getByRole('combobox', { name: /customer/i });
    await userEvent.click(combobox);
    await userEvent.click(await screen.findByRole('option'));
    await userEvent.type(combobox, 'something else');

    await submit('M12 hex nut');

    await waitFor(() => {
      expect(matchBody()).toEqual({ query: 'M12 hex nut' });
    });
  });

  it('carries the selected customer into an example-chip match too', async () => {
    serve(response({ status: 'unique', compatibleCount: 1, results: [match()] }));
    render(<ResultsPanel />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    await userEvent.click(await screen.findByRole('option'));
    await userEvent.click(screen.getByRole('button', { name: 'M8 flat washer' }));

    await waitFor(() => {
      expect(matchBody()).toEqual({ query: 'M8 flat washer', customerId: 'CUST-003' });
    });
  });

  it('fills the input from an example chip and matches it in one click', async () => {
    serve(response({ status: 'unique', compatibleCount: 1, results: [match()] }));
    render(<ResultsPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'M8 flat washer' }));

    await waitFor(() => {
      expect(matchBody()).toEqual({ query: 'M8 flat washer' });
    });
    expect((screen.getByRole('textbox', { name: /query/i }) as HTMLInputElement).value).toBe(
      'M8 flat washer',
    );
  });
});

const TIE = 'all 7 compatible items score the same; the order shown is by SKU';

const washers = (count: number): MatchResponse['results'] =>
  Array.from({ length: count }, (_unused, index) =>
    match({ sku: `PXWASH8${String(index).padStart(3, '0')}`, confidence: 0.14 }),
  );

const tied = (compatibleCount: number, shown: number): MatchResponse =>
  response({
    query: 'M8 flat washer',
    status: 'ambiguous',
    compatibleCount,
    results: washers(Math.min(shown, compatibleCount)),
    notes: [note('tiedSet', TIE)],
  });

const serveTied = (compatibleCount: number) => {
  serve((init) => Promise.resolve(json(tied(compatibleCount, limitOf(init)))));
};

const cards = () => within(screen.getByRole('region', { name: 'Matches' })).getAllByRole('article');

describe('the rest of a compatible set the limit cut off', () => {
  it('reports a tie the answer carries', async () => {
    serveTied(7);
    render(<ResultsPanel />);

    await submit('M8 flat washer');

    expect(await screen.findByText(TIE)).toBeDefined();
  });

  it('names the whole set when the whole set fits', async () => {
    serveTied(7);
    render(<ResultsPanel />);

    await submit('M8 flat washer');

    expect(await screen.findByRole('button', { name: 'Show all 7' })).toBeDefined();
    expect(cards()).toHaveLength(3);
  });

  it('never claims to show everything when the cap admits less', async () => {
    serveTied(81);
    render(<ResultsPanel />);

    await submit('hex nut');

    expect(await screen.findByRole('button', { name: 'Show 10 of 81' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Show all \d/ })).toBeNull();
  });

  it('offers nothing once every compatible item is already on screen', async () => {
    serve(response({ status: 'ambiguous', compatibleCount: 3, results: washers(3) }));
    render(<ResultsPanel />);

    await submit('M4 hex nut');

    await screen.findByRole('region', { name: 'Matches' });
    expect(screen.queryByRole('button', { name: /^Show (all )?\d/ })).toBeNull();
  });

  it('offers nothing for a pool the results are not a truncation of', async () => {
    serve(
      response({ query: 'brass', status: 'unparsed', compatibleCount: 154, results: washers(3) }),
    );
    render(<ResultsPanel />);

    await submit('brass');

    await screen.findByRole('region', { name: 'Matches' });
    expect(screen.queryByRole('button', { name: /^Show (all )?\d/ })).toBeNull();
  });

  it('asks the route for the rest and shows it, then offers nothing more', async () => {
    serveTied(7);
    render(<ResultsPanel />);

    await submit('M8 flat washer');
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 7' }));

    await waitFor(() => {
      expect(cards()).toHaveLength(7);
    });
    expect(matchBodies()).toEqual([
      { query: 'M8 flat washer' },
      { query: 'M8 flat washer', limit: 10 },
    ]);
    expect(screen.queryByRole('button', { name: 'Show all 7' })).toBeNull();
  });

  it('carries the customer the answer was asked for into the wider request', async () => {
    serveTied(7);
    render(<ResultsPanel />);

    await userEvent.click(screen.getByRole('combobox', { name: /customer/i }));
    await userEvent.click(await screen.findByRole('option'));
    await submit('M8 flat washer');
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 7' }));

    await waitFor(() => {
      expect(matchBodies().at(-1)).toEqual({
        query: 'M8 flat washer',
        customerId: 'CUST-003',
        limit: 10,
      });
    });
  });

  it('collapses again when a new query is asked', async () => {
    serveTied(7);
    render(<ResultsPanel />);

    await submit('M8 flat washer');
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 7' }));
    await waitFor(() => {
      expect(cards()).toHaveLength(7);
    });

    await userEvent.clear(screen.getByRole('textbox', { name: /query/i }));
    await submit('M12 hex nut');

    await waitFor(() => {
      expect(cards()).toHaveLength(3);
    });
    expect(screen.getByRole('button', { name: 'Show all 7' })).toBeDefined();
  });
});
