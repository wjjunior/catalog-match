import { afterEach, describe, expect, it } from 'vitest';

import { GET } from '../../app/api/customers/route';
import { setCoreForTests } from '../../server/core';
import { customersResponseSchema } from '../../src/shared/api/schema';
import { CUSTOMERS, RESPONSE_BY_STATUS, stubCore } from './fixtures';

const get = (search = ''): Response => GET(new Request(`http://localhost/api/customers${search}`));

afterEach(() => {
  setCoreForTests(undefined);
});

describe('GET /api/customers', () => {
  it('answers the customer list as JSON', async () => {
    setCoreForTests(stubCore());

    const response = get('?q=acme');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual(CUSTOMERS);
  });

  it('answers a body that satisfies the schema', async () => {
    setCoreForTests(stubCore());

    expect(customersResponseSchema.safeParse(await get().json()).success).toBe(true);
  });

  it('hands the core the query it was given', () => {
    const core = stubCore();
    setCoreForTests(core);

    get('?q=acme');

    expect(core.customerCalls).toEqual(['acme']);
  });

  it('trims the query it was given', () => {
    const core = stubCore();
    setCoreForTests(core);

    get('?q=%20%20acme%20%20');

    expect(core.customerCalls).toEqual(['acme']);
  });

  it.each([
    ['no q at all', ''],
    ['an empty q', '?q='],
    ['a blank q', '?q=%20%20'],
  ])('asks for every customer when the request carries %s', (_name, search) => {
    const core = stubCore();
    setCoreForTests(core);

    get(search);

    expect(core.customerCalls).toEqual([undefined]);
  });

  it('preserves the order the core returned', async () => {
    const reversed = [...CUSTOMERS].reverse();
    setCoreForTests(stubCore(RESPONSE_BY_STATUS.unique, reversed));

    await expect(get().json()).resolves.toEqual(reversed);
  });

  it('refuses to answer while no core is wired', () => {
    expect(() => get()).toThrow(/not wired/i);
  });
});
