import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusLine } from '../../src/entities/match/StatusLine';
import { explanation, match, note, response } from './fixtures';

function lineFor(...args: Parameters<typeof response>) {
  render(<StatusLine response={response(...args)} />);
  return screen.getByRole('status').textContent;
}

describe('StatusLine', () => {
  it('says a unique match is the only one', () => {
    expect(lineFor({ status: 'unique', compatibleCount: 1, results: [match()] })).toBe(
      'Exactly one catalog item satisfies this query.',
    );
  });

  it('names the attributes that would break a tie', () => {
    expect(
      lineFor({
        status: 'ambiguous',
        compatibleCount: 7,
        results: [match({ explanation: explanation({ disambiguateBy: ['material', 'finish'] }) })],
      }),
    ).toBe('Specify material or finish to narrow these down.');
  });

  it('joins three attributes without an Oxford comma, as the core banner does', () => {
    expect(
      lineFor({
        status: 'ambiguous',
        compatibleCount: 9,
        results: [
          match({
            explanation: explanation({ disambiguateBy: ['material', 'finish', 'standard'] }),
          }),
        ],
      }),
    ).toBe('Specify material, finish or standard to narrow these down.');
  });

  it('says so when nothing would distinguish the options', () => {
    expect(lineFor({ status: 'ambiguous', compatibleCount: 9, results: [match()] })).toBe(
      'No further attribute would separate these options.',
    );
  });

  it('renders the failed-constraint note verbatim when nothing is compatible', () => {
    expect(
      lineFor({
        status: 'none',
        compatibleCount: 0,
        notes: [note('failedConstraint', 'no M8 socket head cap screw at 45 mm')],
      }),
    ).toBe('no M8 socket head cap screw at 45 mm');
  });

  it('still says something when the none response carries no note', () => {
    expect(lineFor({ status: 'none', compatibleCount: 0 })).toBe(
      'no compatible item in this catalog',
    );
  });

  it('prompts for a customer when a history reference has none', () => {
    expect(
      lineFor({
        status: 'history',
        compatibleCount: 0,
        query: 'the same washers as last time',
        notes: [note('customerRequired', "select a customer to resolve 'last time'")],
      }),
    ).toBe("select a customer to resolve 'last time'");
  });

  it('names history results without borrowing the compatible-set banner', () => {
    const text = lineFor({
      status: 'history',
      compatibleCount: 0,
      query: 'the same washers as last time',
      results: [match(), match(), match()],
      notes: [note('unverifiedResidue', 'not verifiable: the, as')],
    });

    expect(text).not.toContain('compatible options');
    expect(text).not.toMatch(/^\d/);
    expect(text).toBe("items from this customer's order history, most recent first");
  });

  it('says so when none of the referenced order lines are in the catalog', () => {
    expect(
      lineFor({
        status: 'history',
        compatibleCount: 0,
        query: 'the same washers as last time',
        results: [],
        notes: [note('unverifiedResidue', 'not verifiable: the, as')],
      }),
    ).toBe('no history item in this catalog');
  });

  it('says the query could not be parsed, and that the cards come from text alone', () => {
    expect(lineFor({ status: 'unparsed', compatibleCount: 0, results: [match()] })).toBe(
      'could not parse that query; showing the closest text matches',
    );
  });

  it('drops the promise of text matches when there are none', () => {
    expect(lineFor({ status: 'unparsed', compatibleCount: 0 })).toBe('could not parse that query');
  });

  it('is a live region, so a new response is announced', () => {
    render(<StatusLine response={response({ status: 'unique', results: [match()] })} />);

    expect(screen.getByRole('status')).toBeDefined();
  });
});
