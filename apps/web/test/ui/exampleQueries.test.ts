import { describe, expect, it } from 'vitest';

import { EXAMPLE_QUERIES } from '../../src/shared/api/exampleQueries';

describe('EXAMPLE_QUERIES', () => {
  it('carries all 33 queries from the challenge document', () => {
    expect(EXAMPLE_QUERIES).toHaveLength(33);
  });

  it('has no duplicates', () => {
    expect(new Set(EXAMPLE_QUERIES).size).toBe(EXAMPLE_QUERIES.length);
  });

  it('stores the query text alone, with no numbering, quotes or padding', () => {
    for (const query of EXAMPLE_QUERIES) {
      expect(query).toBe(query.trim());
      // The document wraps each query in quotes and prefixes a list number.
      expect(query).not.toMatch(/^\d+\.\s/);
      expect(query).not.toMatch(/^["'].*["']$/);
    }
  });

  it('keeps the queries in the order the document lists them', () => {
    expect(EXAMPLE_QUERIES[0]).toBe('M8 flat washer');
    expect(EXAMPLE_QUERIES[4]).toBe('SHCS 7/16 x 2-1/2');
    expect(EXAMPLE_QUERIES.at(-1)).toBe('the same washers as last time');
  });

  it('covers the query classes the demo has to show', () => {
    // A tie, a history reference, an attribute-complete query and a noisy one.
    expect(EXAMPLE_QUERIES).toContain('M12 hex nut');
    expect(EXAMPLE_QUERIES).toContain('the same washers as last time');
    expect(EXAMPLE_QUERIES).toContain('1/4-20 x 3/4 hex cap screw zinc');
    expect(EXAMPLE_QUERIES).toContain('M8 x 50mm button socket cap screw alloy black oxide');
  });
});
