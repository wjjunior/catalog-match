import { describe, expect, it } from 'vitest';

import type { MatchResponse, Note } from '../../src/domain/match';
import { core } from './setup';

const ask = (query: string, customerId?: string, limit?: number): MatchResponse =>
  core.matchQuery({ query, ...(customerId === undefined ? {} : { customerId }), limit });

const tie = (response: MatchResponse): Note | undefined =>
  response.notes.find((note) => note.code === 'tiedSet');

const distinct = (response: MatchResponse): number =>
  new Set(response.results.map((match) => match.confidence)).size;

describe('an ambiguous set whose members all score the same', () => {
  it('says so, and counts the compatible set rather than the cards returned', () => {
    const response = ask('M8 flat washer');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(7);
    expect(response.results).toHaveLength(3);
    expect(tie(response)).toEqual({
      code: 'tiedSet',
      message: 'all 7 compatible items score the same; the order shown is by SKU',
    });
  });

  it('counts a set far larger than any limit serves', () => {
    const response = ask('hex nut');

    expect(response.compatibleCount).toBe(81);
    expect(response.results).toHaveLength(3);
    expect(tie(response)?.message).toBe(
      'all 81 compatible items score the same; the order shown is by SKU',
    );
  });

  it('reads the same at every limit, because it is measured over C and not over the cards', () => {
    const three = ask('M8 flat washer');
    const all = ask('M8 flat washer', undefined, 7);

    expect(distinct(all)).toBe(1);
    expect(tie(three)).toEqual(tie(all));
  });
});

describe('an ambiguous set whose members do not all score the same', () => {
  it('stays quiet once a customer history separates them', () => {
    const response = ask('M8 flat washer', 'CUST-001', 7);

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(7);
    expect(distinct(response)).toBeGreaterThan(1);
    expect(tie(response)).toBeUndefined();
  });

  it('stays quiet where the query itself spreads the compatibility', () => {
    const response = ask('big brass bolt', undefined, 49);

    expect(response.status).toBe('ambiguous');
    expect(distinct(response)).toBeGreaterThan(1);
    expect(tie(response)).toBeUndefined();
  });
});

describe('a status the note does not belong to', () => {
  it('never claims a tie for the one item of a unique answer', () => {
    const response = ask('1/4-20 x 3/4 hex cap screw zinc');

    expect(response.status).toBe('unique');
    expect(tie(response)).toBeUndefined();
  });

  // An unparsed confidence is capped token overlap, not a posterior over a compatible
  // set, so an equal pair of them says nothing about how the set is ordered.
  it('never claims a tie for an unranked pool', () => {
    const response = ask('stainless');

    expect(response.status).toBe('unparsed');
    expect(response.compatibleCount).toBe(438);
    expect(tie(response)).toBeUndefined();
  });

  it('never claims a tie for a pool the lexical fallback ranked', () => {
    const response = ask('brass');

    expect(response.status).toBe('unparsed');
    expect(response.results.length).toBeGreaterThan(0);
    expect(tie(response)).toBeUndefined();
  });

  it('never claims a tie where nothing is compatible', () => {
    const response = ask('M14 hex nut');

    expect(response.status).toBe('none');
    expect(tie(response)).toBeUndefined();
  });
});
