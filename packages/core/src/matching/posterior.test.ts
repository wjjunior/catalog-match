import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { CatalogItem } from '../domain/catalog';
import { DEFAULT_MATCHER_CONFIG } from './config';
import { labelFor, posterior, tied } from './posterior';

const config = DEFAULT_MATCHER_CONFIG;

const items = (count: number): CatalogItem[] =>
  Array.from({ length: count }, (_unused, index) => ({
    catalogId: `CAT-${String(index).padStart(4, '0')}`,
    sku: `SKU-${String(index).padStart(4, '0')}`,
    description: `test item ${String(index)}`,
    active: true,
    spec: { residue: [], evidence: {}, provenance: {} },
  }));

const ones = (count: number) => Array.from({ length: count }, () => 1);

const uniform = (count: number) => Array.from({ length: count }, () => 1 / count);

describe('posterior: the worked values of docs/DESIGN.md 5.5', () => {
  it('reaches 0.98 for a unique match with no residue', () => {
    const C = items(1);
    const { p, pNull } = posterior(C, [1], uniform(C.length), 0, config);

    expect(p.get('SKU-0000')).toBeCloseTo(0.98, 10);
    expect(pNull).toBeCloseTo(0.02, 10);
  });

  it('falls to 0.84 for a unique match with two residue tokens', () => {
    const C = items(1);
    const { p } = posterior(C, [1], uniform(C.length), 2, config);

    expect(p.get('SKU-0000')).toBeCloseTo(0.84, 2);
    expect(Math.abs((p.get('SKU-0000') ?? 0) - 0.84)).toBeLessThan(0.005);
  });

  it('gives about 0.14 to each of seven equally compatible items', () => {
    const C = items(7);
    const { p } = posterior(C, ones(7), uniform(C.length), 0, config);

    for (const item of C) {
      expect(p.get(item.sku)).toBeCloseTo(0.14, 10);
    }
  });
});

describe('posterior: edge cases', () => {
  it('puts all the mass on null when the compatible set is empty', () => {
    const { p, pNull } = posterior([], [], [], 0, config);

    expect(p.size).toBe(0);
    expect(pNull).toBe(1);
  });

  it('puts all the mass on null for an empty set even with residue', () => {
    const { pNull } = posterior([], [], [], 3, config);

    expect(pNull).toBe(1);
  });

  it('produces no NaN for a single item and no residue', () => {
    const C = items(1);
    const { p, pNull } = posterior(C, [1], [1], 0, config);

    expect(Number.isNaN(p.get('SKU-0000'))).toBe(false);
    expect(Number.isNaN(pNull)).toBe(false);
  });

  it('carries one entry per SKU of the compatible set', () => {
    const C = items(3);
    const { p } = posterior(C, ones(3), uniform(C.length), 0, config);

    expect([...p.keys()]).toEqual(['SKU-0000', 'SKU-0001', 'SKU-0002']);
  });

  it('rejects an s vector that is not aligned with the compatible set', () => {
    const C = items(3);

    expect(() => posterior(C, [1, 1], uniform(C.length), 0, config)).toThrow(/aligned/i);
  });

  it('rejects a q vector that is not aligned with the compatible set', () => {
    const C = items(3);

    expect(() => posterior(C, ones(3), [0.5, 0.5], 0, config)).toThrow(/aligned/i);
  });
});

describe('labelFor', () => {
  it('calls a posterior at or above the high threshold High', () => {
    expect(labelFor(0.98, config).label).toBe('High');
    expect(labelFor(0.8, config).label).toBe('High');
  });

  it('calls a posterior at or above the medium threshold Medium', () => {
    expect(labelFor(0.69, config).label).toBe('Medium');
    expect(labelFor(0.35, config).label).toBe('Medium');
  });

  it('calls anything below the medium threshold Low', () => {
    expect(labelFor(0.3499, config).label).toBe('Low');
    expect(labelFor(0, config).label).toBe('Low');
  });

  it('reports the shipped thresholds as measured rather than provisional', () => {
    expect(labelFor(0.98, config).provisional).toBe(false);
  });

  it('carries the provisional flag back while a config still sets it', () => {
    const uncalibrated = { ...config, labels: { ...config.labels, provisional: true } };

    expect(labelFor(0.98, uncalibrated).provisional).toBe(true);
  });

  it('reads the thresholds from the config rather than hard-coding them', () => {
    const strict = { ...config, labels: { high: 0.95, medium: 0.9, provisional: true } };

    expect(labelFor(0.94, strict).label).toBe('Medium');
    expect(labelFor(0.96, strict).label).toBe('High');
  });
});

const NUM_RUNS = 500;

const strengths = (size: number) =>
  fc.array(fc.double({ min: 0.01, max: 0.9, noNaN: true }), {
    minLength: size,
    maxLength: size,
  });

const priors = (size: number) =>
  fc.array(fc.double({ min: 0.001, max: 1, noNaN: true }), {
    minLength: size,
    maxLength: size,
  });

const scenario = fc.integer({ min: 1, max: 12 }).chain((size) =>
  fc.record({
    C: fc.constant(items(size)),
    s: strengths(size),
    q: priors(size),
    residueCount: fc.integer({ min: 0, max: 6 }),
    pick: fc.integer({ min: 0, max: size - 1 }),
    bump: fc.double({ min: 0.01, max: 0.1, noNaN: true }),
  }),
);

// Residue divides every posterior by one larger denominator, so the order survives in exact
// arithmetic; two posteriors within an ulp of each other still round onto the same double,
// and strict order is claimed only where the gap is wider than that.
const ORDER_EPSILON = 1e-12;

const expectOrderKept = (
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
) => {
  const read = (p: ReadonlyMap<string, number>, sku: string) => p.get(sku) ?? Number.NaN;

  for (const [high, highValue] of before) {
    for (const [low, lowValue] of before) {
      if (highValue <= lowValue) continue;

      if (highValue - lowValue > ORDER_EPSILON * highValue) {
        expect(read(after, high)).toBeGreaterThan(read(after, low));
      } else {
        expect(read(after, high)).toBeGreaterThanOrEqual(read(after, low));
      }
    }
  }
};

describe('posterior: properties (docs/DESIGN.md 5.5)', () => {
  it('leaves the mass over C and null summing to 1', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount }) => {
        const { p, pNull } = posterior(C, s, q, residueCount, config);
        const total = [...p.values()].reduce((sum, value) => sum + value, 0) + pNull;

        expect(Math.abs(total - 1)).toBeLessThan(1e-9);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('gives equal posteriors to equally compatible items under a uniform prior', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 6 }),
        (size, strength, residueCount) => {
          const C = items(size);
          const s = Array.from({ length: size }, () => strength);
          const { p } = posterior(C, s, uniform(C.length), residueCount, config);
          const values = [...p.values()];
          const first = values[0] ?? Number.NaN;

          for (const value of values) {
            expect(Math.abs(value - first)).toBeLessThan(1e-12);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('lowers every posterior when residue is added, and keeps the order', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount }) => {
        const before = posterior(C, s, q, residueCount, config);
        const after = posterior(C, s, q, residueCount + 1, config);

        for (const [sku, value] of before.p) {
          expect(after.p.get(sku)).toBeLessThan(value);
        }
        expectOrderKept(before.p, after.p);
        expect(after.pNull).toBeGreaterThan(before.pNull);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Strict, not merely non-decreasing: the null mass keeps d p_i / d s_i above zero, and
  // a non-strict assertion would also pass an implementation that ignored the input.
  it('raises p_i when s_i rises', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount, pick, bump }) => {
        const raised = s.map((value, index) => (index === pick ? value + bump : value));
        const sku = C[pick]?.sku ?? '';

        const before = posterior(C, s, q, residueCount, config).p.get(sku) ?? Number.NaN;
        const after = posterior(C, raised, q, residueCount, config).p.get(sku) ?? Number.NaN;

        expect(after).toBeGreaterThan(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('raises p_i when q_i rises', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount, pick, bump }) => {
        const raised = q.map((value, index) => (index === pick ? value + bump : value));
        const sku = C[pick]?.sku ?? '';

        const before = posterior(C, s, q, residueCount, config).p.get(sku) ?? Number.NaN;
        const after = posterior(C, s, raised, residueCount, config).p.get(sku) ?? Number.NaN;

        expect(after).toBeGreaterThan(before);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('produces no NaN, including for a single item and for no residue', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount }) => {
        const { p, pNull } = posterior(C, s, q, residueCount, config);

        expect(Number.isFinite(pNull)).toBe(true);
        for (const value of p.values()) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThan(0);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('gives each SKU the same posterior whatever order C arrives in', () => {
    fc.assert(
      fc.property(scenario, ({ C, s, q, residueCount }) => {
        const straight = posterior(C, s, q, residueCount, config);

        const order = [...C.keys()].reverse();
        const shuffled = posterior(
          order.map((index) => C[index]!),
          order.map((index) => s[index]!),
          order.map((index) => q[index]!),
          residueCount,
          config,
        );

        expect(shuffled.pNull).toBeCloseTo(straight.pNull, 12);
        for (const [sku, value] of straight.p) {
          expect(shuffled.p.get(sku)).toBeCloseTo(value, 12);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('tied', () => {
  it('holds for a set with one member and for a set that shares one value', () => {
    expect(tied([0.14], config.tieTolerance)).toBe(true);
    expect(tied([0.14, 0.14, 0.14], config.tieTolerance)).toBe(true);
  });

  it('holds across the rounding two equal divisions need not agree on', () => {
    const seven = posterior(items(7), ones(7), uniform(7), 0, config);

    expect(new Set(seven.p.values()).size).toBeGreaterThanOrEqual(1);
    expect(tied([...seven.p.values()], config.tieTolerance)).toBe(true);
    expect(tied([0.1, 0.1 + 1e-17], config.tieTolerance)).toBe(true);
  });

  it('fails as soon as one member differs by more than the tolerance', () => {
    expect(tied([0.14, 0.14, 0.13], config.tieTolerance)).toBe(false);
    expect(tied([0.1, 0.1 + 1e-6], config.tieTolerance)).toBe(false);
  });

  it('scales with the values, so a large set of small values is not tied by default', () => {
    expect(tied([1e-6, 2e-6], config.tieTolerance)).toBe(false);
  });
});
