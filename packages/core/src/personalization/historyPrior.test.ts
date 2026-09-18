import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import { CsvOrderHistoryRepository } from '../adapters/csv/csvOrderHistoryRepository';
import { FINISHES, MATERIALS, THREAD_SYSTEMS } from '../domain/attributes';
import type { CatalogItem, CustomerProfile } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import { compatibleSet } from '../matching/compatibility';
import { DEFAULT_MATCHER_CONFIG as config } from '../matching/config';
import { posterior } from '../matching/posterior';
import { descriptionParser } from '../parsing/descriptionParser';
import { queryParser } from '../parsing/queryParser';
import { buildProfile } from './customerProfile';
import { createHistoryPrior, historyPrior } from './historyPrior';

function item(sku: string, description: string, active = true): CatalogItem {
  return { catalogId: sku, sku, description, active, spec: descriptionParser.parse(description) };
}

const evenly = (values: readonly string[]): Record<string, number> =>
  Object.fromEntries(values.map((value) => [value, 1 / values.length]));

function profileOf(overrides: Partial<CustomerProfile> = {}): CustomerProfile {
  return {
    customerId: 'A',
    customerName: 'A Inc',
    nEff: 5,
    lambda: 0.5,
    referenceDate: '2026-04-25',
    shares: {
      material: evenly(MATERIALS),
      finish: evenly(FINISHES),
      threadSystem: evenly(THREAD_SYSTEMS),
    },
    repeats: {},
    purchases: {},
    discontinued: [],
    warnings: [],
    ...overrides,
  };
}

const spread = (profile: CustomerProfile, spec: ParsedSpec, C: readonly CatalogItem[]) =>
  Object.fromEntries(historyPrior(profile, spec, C, config).q);

const total = (q: ReadonlyMap<string, number>): number =>
  [...q.values()].reduce((sum, value) => sum + value, 0);

const M8_WASHER = queryParser.parse('M8 flat washer');
const M16_NUT = queryParser.parse('M16 hex nut');
const BRASS_NUT = queryParser.parse('brass hex nut 1/2-13');

const TWIN_NUTS = [
  item('N1', '1/2-13 HEX NUT ISO 7380 BRASS ZINC'),
  item('N2', '1/2-13 HEX NUT DIN 933 BRASS ZINC'),
];

// A compatible set never mixes materials once the query names one; this one does, so a
// prior that forgot to drop the specified attribute has somewhere to show it.
const MIXED_NUTS = [
  item('N1', '1/2-13 HEX NUT ISO 7380 BRASS ZINC'),
  item('N2', '1/2-13 HEX NUT DIN 912 ALLOY PLAIN'),
];

const M16_NUTS = [
  item('A2', 'M16-2.0 HEX NUT ASTM A307 A2 SS HDG'),
  item('ST', 'M16-2.0 HEX NUT STEEL ZINC'),
];

const RETIRED = item('OLD', 'M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN', false);

const withRetiredSibling = (overrides: Partial<CustomerProfile> = {}): CustomerProfile =>
  profileOf({
    lambda: 1,
    discontinued: ['OLD'],
    purchases: { OLD: { count: 1, lastOrderDate: '2025-12-02', spec: RETIRED.spec } },
    ...overrides,
  });

describe('the mixture', () => {
  it('sums to one over C', () => {
    const profile = profileOf({ repeats: { N1: 1 } });

    expect(total(historyPrior(profile, BRASS_NUT, TWIN_NUTS, config).q)).toBeCloseTo(1, 9);
  });

  it('is uniform when the customer has no history to shrink toward', () => {
    const profile = profileOf({ lambda: 0, repeats: { N1: 1 } });

    expect(spread(profile, BRASS_NUT, TWIN_NUTS)).toEqual({ N1: 0.5, N2: 0.5 });
  });

  it('is uniform when no customer is selected', () => {
    expect(Object.fromEntries(historyPrior(undefined, BRASS_NUT, TWIN_NUTS, config).q)).toEqual({
      N1: 0.5,
      N2: 0.5,
    });
  });

  it('has nothing to distribute over an empty C', () => {
    const { q, reasons } = historyPrior(profileOf(), BRASS_NUT, [], config);

    expect(q.size).toBe(0);
    expect(reasons.size).toBe(0);
  });

  it('blends h and the uniform share by lambda', () => {
    const profile = profileOf({ lambda: 0.5, repeats: { N1: 1 } });

    // Same material and finish, so only the repeat separates them: h is 3 to 1.
    expect(spread(profile, BRASS_NUT, TWIN_NUTS)).toEqual({ N1: 0.625, N2: 0.375 });
  });
});

describe('the repeat weight', () => {
  it('lifts a repeat purchase by one plus wSku times the weight', () => {
    const profile = profileOf({ lambda: 1, repeats: { N1: 1 } });

    expect(spread(profile, BRASS_NUT, TWIN_NUTS)).toEqual({ N1: 0.75, N2: 0.25 });
  });

  it('credits an active item that shares diameter, type and material family with a dropped SKU', () => {
    expect(spread(withRetiredSibling(), M16_NUT, M16_NUTS)).toEqual({ A2: 2 / 3, ST: 1 / 3 });
  });

  it('names the dropped SKU the credit came from, and only on its siblings', () => {
    const { reasons } = historyPrior(withRetiredSibling(), M16_NUT, M16_NUTS, config);

    expect(reasons.get('A2')?.discontinuedSibling).toBe('OLD');
    expect(reasons.get('ST')?.discontinuedSibling).toBeUndefined();
  });

  it('credits the siblings of a purchase whose material was read at family level', () => {
    const family = { value: 'stainless', strength: config.familyCredit } as const;
    const profile = withRetiredSibling({
      purchases: {
        OLD: {
          count: 1,
          lastOrderDate: '2025-12-02',
          spec: { ...RETIRED.spec, material: family },
        },
      },
    });

    expect(historyPrior(profile, M16_NUT, M16_NUTS, config).reasons.get('A2')).toMatchObject({
      discontinuedSibling: 'OLD',
      repeat: config.siblingCredit,
    });
  });

  it('never lowers a weight the customer earned by buying the item itself', () => {
    const { reasons } = historyPrior(
      withRetiredSibling({ repeats: { A2: 1 } }),
      M16_NUT,
      M16_NUTS,
      config,
    );

    expect(reasons.get('A2')?.repeat).toBe(1);
  });

  it('never lowers q_i as repeat_i rises', () => {
    const values = [0, 0.25, 0.5, 0.75, 1].map((repeat) => {
      const profile = profileOf({ repeats: { N1: repeat } });
      return historyPrior(profile, BRASS_NUT, TWIN_NUTS, config).q.get('N1') ?? 0;
    });

    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values.at(0)).toBeLessThan(values.at(-1) ?? 0);
  });
});

describe('the share factors', () => {
  const louder = (profile: CustomerProfile, attr: 'material' | 'finish', value: string) =>
    profileOf({
      ...profile,
      shares: { ...profile.shares, [attr]: { ...profile.shares[attr], [value]: 0.9 } },
    });

  it('ignores the material share when the query states the material', () => {
    const base = profileOf();

    expect(spread(louder(base, 'material', 'brass'), BRASS_NUT, MIXED_NUTS)).toEqual(
      spread(base, BRASS_NUT, MIXED_NUTS),
    );
  });

  it('uses the finish share the query left open', () => {
    const base = profileOf();

    expect(spread(louder(base, 'finish', 'zinc'), BRASS_NUT, MIXED_NUTS)).not.toEqual(
      spread(base, BRASS_NUT, MIXED_NUTS),
    );
  });

  it('reports the factors it applied, and leaves out the ones the query fixed', () => {
    const { reasons } = historyPrior(profileOf(), BRASS_NUT, MIXED_NUTS, config);

    expect(reasons.get('N1')?.shares).toEqual({ finish: 1 / FINISHES.length });
  });

  it('weighs material, finish and system when the query fixes none of them', () => {
    const spec = queryParser.parse('washers');
    const { reasons } = historyPrior(profileOf(), spec, TWIN_NUTS, config);

    expect(Object.keys(reasons.get('N1')?.shares ?? {}).sort()).toEqual([
      'finish',
      'material',
      'threadSystem',
    ]);
  });
});

describe('determinism', () => {
  const profile = profileOf({ repeats: { N1: 1 } });

  it('does not depend on the order of C', () => {
    const forwards = spread(profile, BRASS_NUT, TWIN_NUTS);
    const backwards = spread(profile, BRASS_NUT, [...TWIN_NUTS].reverse());

    expect(backwards).toEqual(forwards);
  });

  it('gives the same answer twice', () => {
    expect(historyPrior(profile, BRASS_NUT, TWIN_NUTS, config)).toEqual(
      historyPrior(profile, BRASS_NUT, TWIN_NUTS, config),
    );
  });
});

describe('the HistoryPrior contract', () => {
  const profile = profileOf({ repeats: { N1: 1 } });

  it('returns q aligned with the candidates it was given', () => {
    const aligned = createHistoryPrior(config).prior(TWIN_NUTS, BRASS_NUT, profile);

    expect(aligned).toEqual([0.625, 0.375]);
  });

  it('falls back to the uniform distribution without a profile', () => {
    expect(createHistoryPrior(config).prior(TWIN_NUTS, BRASS_NUT, undefined)).toEqual([0.5, 0.5]);
  });

  it('feeds the posterior', () => {
    const q = createHistoryPrior(config).prior(TWIN_NUTS, BRASS_NUT, profile);
    const { p } = posterior(TWIN_NUTS, [1, 1], q, 0, config);

    expect((p.get('N1') ?? 0) > (p.get('N2') ?? 0)).toBe(true);
  });
});

describe('the real files', () => {
  const catalogPath = fileURLToPath(new URL('../../../../data/catalog.csv', import.meta.url));
  const historyPath = fileURLToPath(new URL('../../../../data/order_history.csv', import.meta.url));
  const items = CsvCatalogRepository.load(catalogPath, descriptionParser).all();
  const lines = CsvOrderHistoryRepository.load(historyPath).all();

  const profileOfCustomer = (customerId: string) => buildProfile(customerId, lines, items, config);

  const WASHERS = compatibleSet(M8_WASHER, items);

  const ranked = (customerId: string): [string, number][] =>
    [...historyPrior(profileOfCustomer(customerId), M8_WASHER, WASHERS, config).q].sort(
      ([, a], [, b]) => b - a,
    );

  it('has the seven active M8 flat washers to spread over', () => {
    expect(WASHERS).toHaveLength(7);
  });

  it('puts the washer CUST-002 buys again and again far ahead of the rest', () => {
    const [first, second] = ranked('CUST-002');

    expect(first?.[0]).toBe('PXWASH88088PL0688');
    expect((first?.[1] ?? 0) / (second?.[1] ?? 1)).toBeGreaterThan(5);
  });

  it('leads CUST-004 to black oxide, the only finish its history knows', () => {
    expect(ranked('CUST-004')[0]?.[0]).toBe('PXWASH816A2BO0624');
  });

  it('leaves the sparse history of CUST-005 close to uniform', () => {
    const q = ranked('CUST-005').map(([, value]) => value);
    const [top = 0] = q;

    expect(top).toBeLessThan(0.25);
    expect(top / (q.at(-1) ?? 1)).toBeLessThan(2);
  });

  it('is uniform for a customer the history file has never seen', () => {
    expect([
      ...historyPrior(profileOfCustomer('CUST-999'), M8_WASHER, WASHERS, config).q.values(),
    ]).toEqual(Array.from({ length: 7 }, () => 1 / 7));
  });

  it('explains the repeat with the order count and the last order date', () => {
    const { reasons } = historyPrior(profileOfCustomer('CUST-002'), M8_WASHER, WASHERS, config);

    expect(reasons.get('PXWASH88088PL0688')).toMatchObject({
      repeat: 1,
      purchase: { count: 2, lastOrderDate: '2026-04-15' },
    });
  });

  it('does not depend on the order of C', () => {
    const profile = profileOfCustomer('CUST-002');
    const forwards = historyPrior(profile, M8_WASHER, WASHERS, config).q;
    const backwards = historyPrior(profile, M8_WASHER, [...WASHERS].reverse(), config).q;

    expect(Object.fromEntries(backwards)).toEqual(Object.fromEntries(forwards));
  });

  it('gives a reason for every item in C', () => {
    const { reasons } = historyPrior(profileOfCustomer('CUST-002'), M8_WASHER, WASHERS, config);

    expect(reasons.size).toBe(WASHERS.length);
  });

  it('carries the credit of the M16 nut CUST-002 can no longer buy to its stainless sibling', () => {
    const C = compatibleSet(M16_NUT, items);
    const { reasons } = historyPrior(profileOfCustomer('CUST-002'), M16_NUT, C, config);
    const credited = [...reasons].filter(([, reason]) => reason.discontinuedSibling !== undefined);

    expect(C.map((entry) => entry.sku)).not.toContain('PXNUT16888PL0901');
    expect(credited.map(([sku]) => sku)).toEqual(['PXNUT1680A2HG0894']);
    expect(credited[0]?.[1].repeat).toBe(0.5);
  });
});
