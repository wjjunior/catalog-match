import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, getCustomers, postMatch } from '../../src/shared/api/client';
import type { MatchResponse } from '../../src/shared/api/client';

const RESPONSE: MatchResponse = {
  query: 'M12 hex nut',
  parsed: {},
  status: 'ambiguous',
  compatibleCount: 9,
  results: [],
  alternatives: [],
  notes: [],
  timingsMs: { parse: 0.2, match: 0.4 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postMatch', () => {
  it('posts the query as JSON to the match route', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE));

    await postMatch({ query: 'M12 hex nut' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/match');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ query: 'M12 hex nut' });
  });

  it('sends the customer id only when one is selected', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE));

    await postMatch({ query: 'M8 flat washer', customerId: 'CUST-002' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      query: 'M8 flat washer',
      customerId: 'CUST-002',
    });
  });

  it('returns the decoded response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE));

    await expect(postMatch({ query: 'M12 hex nut' })).resolves.toEqual(RESPONSE);
  });

  it('throws an ApiError carrying the status when the route rejects the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'empty query' }, 400));

    await expect(postMatch({ query: '  ' })).rejects.toBeInstanceOf(ApiError);
    await expect(postMatch({ query: '  ' })).rejects.toMatchObject({ status: 400 });
  });

  it('passes an abort signal through so a superseded request can be dropped', async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESPONSE));
    const controller = new AbortController();

    await postMatch({ query: 'M12 hex nut' }, controller.signal);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});

describe('getCustomers', () => {
  it('encodes the filter into the query string', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await getCustomers('marine electrical');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customers?q=marine%20electrical');
  });

  it('asks for every customer when the filter is empty', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await getCustomers('');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/customers?q=');
  });

  it('returns the decoded customer list', async () => {
    const customers = [
      {
        customerId: 'CUST-003',
        customerName: 'Marine Electrical Corp',
        orderCount: 7,
        lastOrderDate: '2025-09-02',
      },
    ];
    fetchMock.mockResolvedValue(jsonResponse(customers));

    await expect(getCustomers('marine')).resolves.toEqual(customers);
  });

  it('throws an ApiError when the route fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(getCustomers('')).rejects.toMatchObject({ status: 500 });
  });
});
