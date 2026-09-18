import { describe, expect, it } from 'vitest';
import type { MatchStatus } from '@catalog-match/core';

import {
  customersResponseSchema,
  matchRequestSchema,
  matchResponseSchema,
} from '../../src/shared/api/schema';
import { CUSTOMERS, RESPONSE_BY_STATUS } from './fixtures';

const STATUSES = Object.keys(RESPONSE_BY_STATUS) as MatchStatus[];

const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const without = (value: unknown, key: string): unknown => {
  const copy = overTheWire(value) as Record<string, unknown>;
  delete copy[key];

  return copy;
};

describe('the match response schema', () => {
  it.each(STATUSES)('round-trips a %s response', (status) => {
    const response = RESPONSE_BY_STATUS[status];

    expect(matchResponseSchema.parse(overTheWire(response))).toEqual(response);
  });

  it('rejects a status the domain does not have', () => {
    const response = { ...RESPONSE_BY_STATUS.unique, status: 'probably' };

    expect(() => matchResponseSchema.parse(overTheWire(response))).toThrow();
  });

  it('rejects a note code the domain does not have', () => {
    const response = {
      ...RESPONSE_BY_STATUS.unique,
      notes: [{ code: 'somethingWentWrong', message: 'oops' }],
    };

    expect(() => matchResponseSchema.parse(overTheWire(response))).toThrow();
  });

  it('rejects a response without the parsed spec', () => {
    expect(() => matchResponseSchema.parse(without(RESPONSE_BY_STATUS.unique, 'parsed'))).toThrow();
  });

  it('rejects a confidence that is not a number', () => {
    const [match] = RESPONSE_BY_STATUS.unique.results;
    const response = {
      ...RESPONSE_BY_STATUS.unique,
      results: [{ ...match, confidence: 'high' }],
    };

    expect(() => matchResponseSchema.parse(overTheWire(response))).toThrow();
  });
});

describe('the match request schema', () => {
  it('defaults the limit to 3', () => {
    expect(matchRequestSchema.parse({ query: 'm8 bolt' })).toEqual({ query: 'm8 bolt', limit: 3 });
  });

  it('trims the query before measuring it', () => {
    expect(matchRequestSchema.parse({ query: '  m8 bolt  ' }).query).toBe('m8 bolt');
  });

  it.each(['', '   ', '\t\n'])('rejects the query %j', (query) => {
    expect(matchRequestSchema.safeParse({ query }).success).toBe(false);
  });

  it.each([0, 11, 2.5, -1])('rejects the limit %s', (limit) => {
    expect(matchRequestSchema.safeParse({ query: 'm8', limit }).success).toBe(false);
  });

  it.each([1, 3, 10])('accepts the limit %s', (limit) => {
    expect(matchRequestSchema.parse({ query: 'm8', limit }).limit).toBe(limit);
  });

  it('rejects a customerId that is blank', () => {
    expect(matchRequestSchema.safeParse({ query: 'm8', customerId: '  ' }).success).toBe(false);
  });

  it('keeps a customerId that is not blank', () => {
    expect(matchRequestSchema.parse({ query: 'm8', customerId: 'C001' }).customerId).toBe('C001');
  });

  it('drops keys the contract does not name', () => {
    const parsed = matchRequestSchema.parse({ query: 'm8', sortBy: 'price' });

    expect(parsed).toEqual({ query: 'm8', limit: 3 });
  });

  it.each([undefined, null, 42, [], {}])('rejects the body %j', (body) => {
    expect(matchRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('the customers response schema', () => {
  it('round-trips the customer list', () => {
    expect(customersResponseSchema.parse(overTheWire(CUSTOMERS))).toEqual(CUSTOMERS);
  });

  it('rejects a customer without a last order date', () => {
    const rows = [without(CUSTOMERS[0], 'lastOrderDate')];

    expect(() => customersResponseSchema.parse(rows)).toThrow();
  });
});
