import { afterEach, describe, expect, it } from 'vitest';
import type { MatchStatus } from '@catalog-match/core';

import { POST } from '../../app/api/match/route';
import { setCoreForTests } from '../../server/core';
import { matchResponseSchema } from '../../src/shared/api/schema';
import { RESPONSE_BY_STATUS, stubCore } from './fixtures';

const STATUSES = Object.keys(RESPONSE_BY_STATUS) as MatchStatus[];

const post = (body: string): Promise<Response> =>
  POST(
    new Request('http://localhost/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );

const postJson = (body: unknown): Promise<Response> => post(JSON.stringify(body));

afterEach(() => {
  setCoreForTests(undefined);
});

describe('POST /api/match', () => {
  it.each(STATUSES)('serializes a %s response exactly as the core produced it', async (status) => {
    const expected = RESPONSE_BY_STATUS[status];
    setCoreForTests(stubCore(expected));

    const response = await postJson({ query: expected.query });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expected);
  });

  it.each(STATUSES)('answers a %s response that satisfies the schema', async (status) => {
    setCoreForTests(stubCore(RESPONSE_BY_STATUS[status]));

    const response = await postJson({ query: RESPONSE_BY_STATUS[status].query });

    expect(matchResponseSchema.safeParse(await response.json()).success).toBe(true);
  });

  it('answers as JSON', async () => {
    setCoreForTests(stubCore());

    const response = await postJson({ query: 'm8 bolt' });

    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('hands the core the query, the customer and the limit', async () => {
    const core = stubCore();
    setCoreForTests(core);

    await postJson({ query: '  m8 bolt  ', customerId: 'C001', limit: 5 });

    expect(core.matchCalls).toEqual([{ query: 'm8 bolt', customerId: 'C001', limit: 5 }]);
  });

  it('hands the core a limit of 3 when the body omits one', async () => {
    const core = stubCore();
    setCoreForTests(core);

    await postJson({ query: 'm8 bolt' });

    expect(core.matchCalls).toEqual([{ query: 'm8 bolt', limit: 3 }]);
  });

  it.each([
    ['an empty query', { query: '' }],
    ['a whitespace-only query', { query: '   ' }],
    ['a missing query', { limit: 3 }],
    ['a query that is not a string', { query: 42 }],
    ['a limit below the range', { query: 'm8', limit: 0 }],
    ['a limit above the range', { query: 'm8', limit: 11 }],
    ['a fractional limit', { query: 'm8', limit: 2.5 }],
    ['a blank customerId', { query: 'm8', customerId: '  ' }],
    ['a body that is not an object', 'just text'],
  ])('rejects %s with 400', async (_name, body) => {
    setCoreForTests(stubCore());

    const response = await postJson(body);

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400 rather than 500', async () => {
    setCoreForTests(stubCore());

    const response = await post('{ "query": ');

    expect(response.status).toBe(400);
  });

  it('explains the rejection in the body', async () => {
    setCoreForTests(stubCore());

    const response = await postJson({ query: '   ' });

    await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
  });

  it('never reaches the core when the body is rejected', async () => {
    const core = stubCore();
    setCoreForTests(core);

    await postJson({ query: '' });
    await post('{ "query": ');

    expect(core.matchCalls).toEqual([]);
  });

  it('refuses to answer while no core is wired', async () => {
    await expect(postJson({ query: 'm8 bolt' })).rejects.toThrow(/not wired/i);
  });
});
