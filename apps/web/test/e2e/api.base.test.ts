import type { Alternative, CustomerSummary, Match, MatchResponse } from '@catalog-match/core';
import { describe, expect, it } from 'vitest';

import { GET } from '../../app/api/customers/route';
import { POST } from '../../app/api/match/route';
import type {
  Alternative as ClientAlternative,
  Match as ClientMatch,
  MatchResponse as ClientMatchResponse,
} from '../../src/shared/api/client';
import { EXAMPLE_QUERIES } from '../../src/shared/api/exampleQueries';
import { customersResponseSchema, matchResponseSchema } from '../../src/shared/api/schema';

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

// The stub core in test/api cannot show this: only the real parser decides that text is
// unreadable, and the contract is that it never becomes a 500.
describe('text the parser cannot read', () => {
  it.each(['qqq zzz nothing here', '!!!', 'the quick brown fox'])(
    'answers %s with 200 and the unparsed status',
    async (query) => {
      const response = await post({ query });

      expect(response.status).toBe(200);

      const body = (await response.json()) as MatchResponse;

      expect(matchResponseSchema.safeParse(body).success).toBe(true);
      expect(body.status).toBe('unparsed');
    },
  );
});

describe('the customer list over the real history', () => {
  const customers = async (search = ''): Promise<CustomerSummary[]> => {
    const response = GET(new Request(`http://localhost/api/customers${search}`));

    expect(response.status).toBe(200);

    return (await response.json()) as CustomerSummary[];
  };

  it('lists every customer the history file holds', async () => {
    const all = await customers();

    expect(customersResponseSchema.safeParse(all).success).toBe(true);
    expect(all).toHaveLength(5);
  });

  it('finds a customer by the prefix of its id', async () => {
    expect((await customers('?q=CUST-001'))[0]?.customerId).toBe('CUST-001');
  });

  it('finds a customer by a fragment of its name, whatever the casing', async () => {
    expect((await customers('?q=midwest'))[0]?.customerName).toBe('Midwest Industrial Supply');
  });
});

describe('latency through the route handler', () => {
  it('answers the example queries under 50 ms at p95', async () => {
    for (const query of EXAMPLE_QUERIES) await match(query);

    const timings: number[] = [];

    for (const query of EXAMPLE_QUERIES) {
      const started = performance.now();
      await match(query);
      timings.push(performance.now() - started);
    }

    const sorted = [...timings].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;

    expect(p95).toBeLessThan(50);
  });
});
