import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import { CsvOrderHistoryRepository } from '../adapters/csv/csvOrderHistoryRepository';
import type { CatalogItem, HistoryLine } from '../domain/catalog';
import { DEFAULT_MATCHER_CONFIG as config } from '../matching/config';
import { descriptionParser } from '../parsing/descriptionParser';
import { buildProfile } from './customerProfile';

const WASHER = 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN';
const BRASS_WASHER = 'M8-1.25 FLAT WASHER ISO 7380 BRASS PLAIN';
const NUT = 'M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN';

function item(sku: string, description: string, active = true): CatalogItem {
  return { catalogId: sku, sku, description, active, spec: descriptionParser.parse(description) };
}

function line(
  customerId: string,
  orderDate: string,
  sku: string,
  description: string,
): HistoryLine {
  return {
    customerId,
    customerName: `${customerId} Inc`,
    orderDate,
    sku,
    description,
    quantity: 10,
  };
}

const catalog = [item('PXW', WASHER), item('PXN', NUT)];

/** 2026-01-01 is exactly tau days before 2026-06-30, and the later line belongs to another
 * customer, so a profile weighted at exp(-1) can only have taken the reference from the file. */
const twoCustomers = [line('A', '2026-01-01', 'PXW', WASHER), line('B', '2026-06-30', 'PXN', NUT)];

const ONE_TAU = Math.exp(-1);

describe('recency and shrinkage', () => {
  it('weights a line by exp(-age / tau)', () => {
    expect(buildProfile('A', twoCustomers, catalog, config).nEff).toBeCloseTo(ONE_TAU, 10);
  });

  it('measures age from the latest order in the file, never the wall clock', () => {
    expect(buildProfile('A', twoCustomers, catalog, config).referenceDate).toBe('2026-06-30');
  });

  it('shrinks lambda toward zero when the history is thin', () => {
    expect(buildProfile('A', twoCustomers, catalog, config).lambda).toBeCloseTo(
      ONE_TAU / (ONE_TAU + config.k),
      10,
    );
  });
});

describe('smoothed shares', () => {
  const profile = buildProfile('A', twoCustomers, catalog, config);

  it('gives every catalog value of an attribute a share', () => {
    expect(Object.keys(profile.shares.material)).toHaveLength(6);
    expect(Object.keys(profile.shares.finish)).toHaveLength(6);
    expect(Object.keys(profile.shares.threadSystem)).toHaveLength(3);
  });

  it('places a value the customer never bought at the smoothing floor', () => {
    expect(profile.shares.material).toMatchObject({
      brass: expect.closeTo(config.alpha / (ONE_TAU + config.alpha * 6), 10),
    });
  });

  it('sums to one over the values of an attribute', () => {
    const total = Object.values(profile.shares.finish).reduce((sum, share) => sum + share, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('repeat weights', () => {
  it('caps a SKU bought many times at one', () => {
    const lines = ['2026-06-28', '2026-06-29', '2026-06-30'].map((date) =>
      line('A', date, 'PXW', WASHER),
    );
    expect(buildProfile('A', lines, catalog, config).repeats).toMatchObject({ PXW: 1 });
  });

  it('keeps a single old purchase below one', () => {
    expect(buildProfile('A', twoCustomers, catalog, config).repeats).toMatchObject({
      PXW: expect.closeTo(ONE_TAU, 10),
    });
  });
});

describe('purchase facts', () => {
  it('counts the orders of a SKU and keeps the latest date', () => {
    const lines = [line('A', '2025-09-28', 'PXW', WASHER), line('A', '2026-04-15', 'PXW', WASHER)];

    expect(buildProfile('A', lines, catalog, config).purchases).toMatchObject({
      PXW: { count: 2, lastOrderDate: '2026-04-15' },
    });
  });

  it('keeps the spec of the most recent line, not of the last one read', () => {
    const lines = [
      line('A', '2026-04-15', 'PXW', WASHER),
      line('A', '2025-09-28', 'PXW', BRASS_WASHER),
    ];

    const { purchases } = buildProfile('A', lines, catalog, config);

    expect(purchases.PXW?.spec.material?.value).toBe('ss_18_8');
  });

  it('has nothing to say about a line it could not read', () => {
    expect(
      buildProfile('A', [line('A', '2026-06-30', 'PXX', 'mystery')], catalog, config).purchases,
    ).toEqual({});
  });
});

describe('the cross-check against the catalog', () => {
  it('lists a purchased SKU the catalog no longer sells', () => {
    const inactive = [item('PXW', WASHER), item('PXN', NUT, false)];
    const lines = [line('A', '2026-06-30', 'PXW', WASHER), line('A', '2026-06-30', 'PXN', NUT)];

    const profile = buildProfile('A', lines, inactive, config);

    expect(profile.discontinued).toEqual(['PXN']);
    expect(profile.warnings).toEqual([]);
  });

  it('warns about a SKU the catalog does not carry, and still counts the line', () => {
    const lines = [line('A', '2026-06-30', 'PXGHOST', WASHER)];

    const profile = buildProfile('A', lines, catalog, config);

    expect(profile.warnings).toEqual(['PXGHOST is not in the catalog']);
    expect(profile.nEff).toBeCloseTo(1, 10);
  });

  it('warns when the description disagrees with its catalog row, and reads the description', () => {
    const lines = [line('A', '2026-06-30', 'PXW', BRASS_WASHER)];

    const profile = buildProfile('A', lines, catalog, config);

    expect(profile.warnings).toEqual(['PXW disagrees with its catalog row']);
    expect(profile.shares.material).toMatchObject({
      brass: expect.closeTo((1 + config.alpha) / (1 + config.alpha * 6), 10),
    });
  });

  it('warns about a description it cannot read, and leaves it out of the profile', () => {
    const lines = [
      line('A', '2026-06-30', 'PXW', WASHER),
      line('A', '2026-06-30', 'PXX', 'mystery'),
    ];

    const profile = buildProfile('A', lines, catalog, config);

    expect(profile.nEff).toBeCloseTo(1, 10);
    expect(profile.repeats).not.toHaveProperty('PXX');
    expect(profile.warnings).toHaveLength(1);
    expect(profile.warnings[0]).toContain('PXX');
  });
});

describe('a customer with no history', () => {
  const profile = buildProfile('NOBODY', twoCustomers, catalog, config);

  it('carries no weight and no shrinkage', () => {
    expect(profile.nEff).toBe(0);
    expect(profile.lambda).toBe(0);
    expect(profile.customerName).toBe('');
  });

  it('leaves the shares exactly uniform', () => {
    expect(profile.shares.material).toMatchObject({ steel: expect.closeTo(1 / 6, 10) });
    expect(profile.shares.threadSystem).toMatchObject({ metric: expect.closeTo(1 / 3, 10) });
  });

  it('has nothing to repeat, drop or warn about', () => {
    expect(profile.repeats).toEqual({});
    expect(profile.discontinued).toEqual([]);
    expect(profile.warnings).toEqual([]);
  });
});

describe('the real files', () => {
  const catalogPath = fileURLToPath(new URL('../../../../data/catalog.csv', import.meta.url));
  const historyPath = fileURLToPath(new URL('../../../../data/order_history.csv', import.meta.url));
  const items = CsvCatalogRepository.load(catalogPath, descriptionParser).all();
  const history = CsvOrderHistoryRepository.load(historyPath);
  const lines = history.all();

  const profileOf = (customerId: string) => buildProfile(customerId, lines, items, config);

  it('reads every history line without a warning', () => {
    expect(lines).toHaveLength(76);
    for (const customer of history.customers()) {
      expect(profileOf(customer.customerId).warnings).toEqual([]);
    }
  });

  it('weights the seventeen 18-8 SS plain lines of CUST-002', () => {
    const profile = profileOf('CUST-002');

    expect(history.byCustomer('CUST-002')).toHaveLength(17);
    expect(profile.nEff).toBeCloseTo(8.2918838, 6);
    expect(profile.lambda).toBeCloseTo(0.6238306, 6);
    expect(profile.shares.material).toMatchObject({ ss_18_8: expect.closeTo(0.778602, 5) });
    expect(profile.shares.finish).toMatchObject({ plain: expect.closeTo(0.778602, 5) });
  });

  it('gives the twice-bought M8 washer of CUST-002 the full repeat weight', () => {
    expect(profileOf('CUST-002').repeats).toMatchObject({ PXWASH88088PL0688: 1 });
  });

  it('lists the M16 nut CUST-002 bought before it went inactive', () => {
    expect(profileOf('CUST-002').discontinued).toEqual(['PXNUT16888PL0901']);
  });

  it('leaves the sparse history of CUST-005 near uniform', () => {
    const profile = profileOf('CUST-005');

    expect(history.byCustomer('CUST-005')).toHaveLength(6);
    expect(profile.lambda).toBeCloseTo(0.3512873, 6);
    expect(Math.max(...Object.values(profile.shares.material))).toBeLessThan(0.4);
    expect(Math.max(...Object.values(profile.shares.finish))).toBeLessThan(0.4);
    expect(Math.max(...Object.values(profile.repeats))).toBeLessThan(0.8);
  });

  it('reads CUST-004 as alloy and black oxide', () => {
    const profile = profileOf('CUST-004');

    expect(profile.shares.material).toMatchObject({ alloy: expect.closeTo(0.794551, 5) });
    expect(profile.shares.finish).toMatchObject({ black_oxide: expect.closeTo(0.794551, 5) });
  });

  it('gives a customer the file has never seen no weight at all', () => {
    expect(profileOf('CUST-999').lambda).toBe(0);
  });

  it('builds the same profile every time', () => {
    expect(profileOf('CUST-002')).toEqual(profileOf('CUST-002'));
  });
});
