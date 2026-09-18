import { describe, expect, it } from 'vitest';
import { EvalCase } from './schema';

const base = {
  id: 'ex-01',
  query: 'M8 flat washer',
  customerId: null,
  expectedStatus: 'ambiguous' as const,
  expected: ['PXWASH812A2YZ0016', 'PXWASH816A2BO0624'],
  tags: ['example', 'tie'] as const,
};

const parse = (patch: Record<string, unknown>) => EvalCase.safeParse({ ...base, ...patch });

describe('EvalCase', () => {
  it('accepts a well-formed tie row', () => {
    expect(parse({}).success).toBe(true);
  });

  it('rejects an id outside the three blocks', () => {
    expect(parse({ id: 'foo-01' }).success).toBe(false);
  });

  it('rejects a tag outside the vocabulary', () => {
    expect(parse({ tags: ['exmaple'] }).success).toBe(false);
  });

  it('requires exactly one SKU when the status is unique', () => {
    expect(parse({ expectedStatus: 'unique', expected: ['A', 'B'] }).success).toBe(false);
    expect(parse({ expectedStatus: 'unique', expected: ['A'] }).success).toBe(true);
  });

  it('requires two or more SKUs when the status is ambiguous', () => {
    expect(parse({ expected: ['A'] }).success).toBe(false);
  });

  it('allows an empty set on an ambiguous row only when it is status-only', () => {
    expect(parse({ expected: [], tags: ['adversarial', 'typo'] }).success).toBe(false);
    expect(parse({ expected: [], tags: ['adversarial', 'typo', 'status-only'] }).success).toBe(
      true,
    );
    expect(parse({ tags: ['adversarial', 'typo', 'status-only'] }).success).toBe(false);
  });

  it('requires an empty set when nothing matched or nothing parsed', () => {
    expect(parse({ expectedStatus: 'none', expected: ['A'] }).success).toBe(false);
    expect(parse({ expectedStatus: 'none', expected: [] }).success).toBe(true);
    expect(parse({ expectedStatus: 'unparsed', expected: [] }).success).toBe(true);
  });

  it('ties the history status to whether a customer is named', () => {
    expect(parse({ expectedStatus: 'history', expected: [] }).success).toBe(true);
    expect(
      parse({ expectedStatus: 'history', expected: [], customerId: 'CUST-002', rationale: 'r' })
        .success,
    ).toBe(false);
    expect(
      parse({
        expectedStatus: 'history',
        expected: ['A'],
        expectedTop1: 'A',
        customerId: 'CUST-002',
        rationale: 'r',
      }).success,
    ).toBe(true);
  });

  it('requires expectedTop1 to be a member of expected', () => {
    expect(parse({ expectedTop1: 'PXNOTINSET' }).success).toBe(false);
    expect(parse({ expectedTop1: 'PXWASH812A2YZ0016' }).success).toBe(true);
  });

  it('requires a rationale on every personalized row', () => {
    expect(parse({ customerId: 'CUST-002' }).success).toBe(false);
    expect(parse({ customerId: 'CUST-002', rationale: '   ' }).success).toBe(false);
    expect(parse({ customerId: 'CUST-002', rationale: 'bought it twice' }).success).toBe(true);
  });

  it('allows alternatives only when nothing matched', () => {
    expect(parse({ expectedAlternatives: ['A'] }).success).toBe(false);
    expect(
      parse({ expectedStatus: 'none', expected: [], expectedAlternatives: ['A'] }).success,
    ).toBe(true);
  });

  it('rejects duplicates in any SKU list', () => {
    expect(parse({ expected: ['A', 'A'] }).success).toBe(false);
    expect(parse({ tags: ['example', 'example'] }).success).toBe(false);
  });

  it('rejects a malformed customer id', () => {
    expect(parse({ customerId: 'CUST-2', rationale: 'r' }).success).toBe(false);
  });
});
