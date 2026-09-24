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

function serve(matchResponse: MatchResponse | (() => Promise<Response>)) {
  fetchMock.mockImplementation((url: string) => {
    if (url.startsWith('/api/customers')) return Promise.resolve(json([customer()]));
    return typeof matchResponse === 'function'
      ? matchResponse()
      : Promise.resolve(json(matchResponse));
  });
}

async function submit(query: string) {
  await userEvent.type(screen.getByRole('textbox', { name: /query/i }), query);
  await userEvent.click(screen.getByRole('button', { name: 'Match catalog' }));
}

function matchBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([url]) => url === '/api/match');
  return JSON.parse(String((call?.[1] as RequestInit).body)) as Record<string, unknown>;
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
