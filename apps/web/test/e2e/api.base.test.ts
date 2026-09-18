import type { Alternative, Match, MatchResponse } from '@catalog-match/core';
import { describe, expect, it } from 'vitest';

import { POST } from '../../app/api/match/route';
import type {
  Alternative as ClientAlternative,
  Match as ClientMatch,
  MatchResponse as ClientMatchResponse,
} from '../../src/shared/api/client';
import { EXAMPLE_QUERIES } from '../../src/shared/api/exampleQueries';
import { matchResponseSchema } from '../../src/shared/api/schema';

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request('http://localhost/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const match = async (query: string): Promise<MatchResponse> => {
  const response = await post({ query });

  expect(response.status).toBe(200);

  return (await response.json()) as MatchResponse;
};

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The client declares the wire contract by hand; these make a divergence from the domain
// types a compile error. `parsed` is out because the client narrows it to `unknown`.
const CONTRACT: [
  Mutual<Omit<MatchResponse, 'parsed'>, Omit<ClientMatchResponse, 'parsed'>>,
  Mutual<Match, ClientMatch>,
  Mutual<Alternative, ClientAlternative>,
] = [true, true, true];

describe('the client contract', () => {
  it('stays mutually assignable with the domain types', () => {
    expect(CONTRACT).toEqual([true, true, true]);
  });
});

describe('the example set over the real catalog', () => {
  it.each(EXAMPLE_QUERIES)('answers %s on the wire', async (query) => {
    const response = await match(query);

    expect(matchResponseSchema.safeParse(response).success).toBe(true);
    expect(response.results.length).toBeLessThanOrEqual(3);
    expect(response.compatibleCount).toBeGreaterThanOrEqual(0);

    if (response.status === 'none') expect(response.results).toEqual([]);
  });
});

// Invariants alone would pass against an empty catalog. These four say the data directory
// found the real file.
describe('the wire carries what the catalog holds', () => {
  it('answers a fully specified query with its SKU', async () => {
    const response = await match('1/4-20 x 3/4 hex cap screw zinc');

    expect(response.status).toBe('unique');
    expect(response.results[0]?.sku).toBe('PXHEX1434STZC0003');
  });

  it('answers a length the catalog does not stock with the note and the alternatives', async () => {
    const response = await match('M8 x 45mm SHCS');

    expect(response.status).toBe('none');
    expect(response.results).toEqual([]);
    expect(response.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no M8 socket head cap screw at 45 mm',
    });
    expect(response.alternatives).toHaveLength(3);
    expect(response.alternatives.every((option) => option.relaxed.includes('length'))).toBe(true);
  });

  it('leaves a query missing attributes ambiguous with what would settle it', async () => {
    const response = await match('M8 flat washer');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(7);
    expect(response.results[0]?.explanation.disambiguateBy).toEqual([
      'material',
      'finish',
      'standard',
    ]);
  });

  it('asks for a customer before resolving a history reference', async () => {
    const response = await match('the same washers as last time');

    expect(response.status).toBe('history');
    expect(response.results).toEqual([]);
    expect(response.notes).toEqual([
      { code: 'customerRequired', message: "select a customer to resolve 'last time'" },
    ]);
  });
});
