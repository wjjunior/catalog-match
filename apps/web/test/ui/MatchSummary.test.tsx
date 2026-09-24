import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MatchSummary } from '../../src/entities/match/MatchSummary';
import { explanation, match, response } from './fixtures';

describe('MatchSummary', () => {
  it('leads with the size of the compatible set', () => {
    const { unmount } = render(
      <MatchSummary
        response={response({ status: 'ambiguous', compatibleCount: 9, results: [match()] })}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('9 compatible items');
    unmount();

    render(
      <MatchSummary
        response={response({ status: 'unique', compatibleCount: 1, results: [match()] })}
      />,
    );
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('1 compatible item');
  });

  // There is no compatible set behind a history answer, so no count may appear over one.
  it('states no count over order-history results', () => {
    render(
      <MatchSummary
        response={response({
          status: 'history',
          compatibleCount: 0,
          query: 'the same washers as last time',
          results: [match(), match(), match()],
        })}
      />,
    );

    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      "items from this customer's order history, most recent first",
    );
  });

  it('names the attributes the query never mentioned as missing information', () => {
    render(
      <MatchSummary
        response={response({
          status: 'ambiguous',
          compatibleCount: 9,
          results: [match({ explanation: explanation({ unspecified: ['material', 'finish'] }) })],
        })}
      />,
    );

    const missing = within(screen.getByRole('list', { name: 'Missing information' })).getAllByRole(
      'listitem',
    );
    expect(missing.map((item) => item.textContent)).toEqual(['Material', 'Finish']);
  });

  it('claims the order history only when a result carries one', () => {
    const anonymous = response({ status: 'unique', compatibleCount: 1, results: [match()] });

    const { unmount } = render(
      <MatchSummary response={anonymous} customerName="Marine Electrical Corp" />,
    );
    expect(screen.getByText('Matched for Marine Electrical Corp.')).toBeDefined();
    expect(screen.queryByText(/order history/)).toBeNull();
    unmount();

    render(
      <MatchSummary
        response={response({
          status: 'unique',
          compatibleCount: 1,
          results: [
            match({
              explanation: explanation({
                personalization: { reason: 'bought 2 in the last year', prior: 0.61 },
              }),
            }),
          ],
        })}
        customerName="Marine Electrical Corp"
      />,
    );
    expect(
      screen.getByText('Matched for Marine Electrical Corp, ranked with their order history.'),
    ).toBeDefined();
  });
});
