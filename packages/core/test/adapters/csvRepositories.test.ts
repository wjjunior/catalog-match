import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../../src/adapters/csv/csvCatalogRepository';
import { CsvOrderHistoryRepository } from '../../src/adapters/csv/csvOrderHistoryRepository';
import type { DescriptionParser } from '../../src/domain/contracts';

const stubParser: DescriptionParser = {
  parse: () => ({ residue: [], evidence: {}, provenance: {} }),
};

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

describe('loading from a file', () => {
  const catalog = CsvCatalogRepository.load(
    path('../fixtures/data/catalog-sample.csv'),
    stubParser,
  );

  it('reads the rows of the file', () => {
    expect(catalog.all().map((i) => i.sku)).toEqual(['PXHEX9001', 'PXWASH9002', 'PXNUT9004']);
  });

  it('keeps an inch mark and an embedded comma intact', () => {
    expect(catalog.bySku('PXHEX9001')?.description).toBe('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');
    expect(catalog.bySku('PXNUT9004')?.description).toBe('M16-2.0 HEX NUT, IFI 111, 18-8 SS PLAIN');
  });
});

// The numbers below are the acceptance criteria of PRG-10, read off data/ directly.
describe('the real catalog', () => {
  const catalog = CsvCatalogRepository.load(path('../../../../data/catalog.csv'), stubParser);

  it('holds 960 unique SKUs out of 1000 rows', () => {
    expect(catalog.all()).toHaveLength(960);
  });

  it('holds 44 inactive SKUs', () => {
    expect(catalog.all().filter((i) => !i.active)).toHaveLength(44);
    expect(catalog.active()).toHaveLength(916);
  });

  it('keeps the first catalog id of a duplicated SKU', () => {
    expect(catalog.bySku('PXLAG38112STHG0001')?.catalogId).toBe('CAT-0001');
  });

  it('keeps a quoted description with its inch mark', () => {
    expect(catalog.bySku('PXHEX1434STZC0003')?.description).toBe(
      '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC',
    );
  });

  it('preserves the 74 rows written in lower case', () => {
    const lowercase = catalog.all().filter((i) => i.description === i.description.toLowerCase());

    expect(lowercase.length).toBeGreaterThan(0);
    expect(lowercase.every((i) => i.description === i.description.toLowerCase())).toBe(true);
  });
});

describe('the real order history', () => {
  const history = CsvOrderHistoryRepository.load(path('../../../../data/order_history.csv'));

  it('holds 76 lines', () => {
    expect(history.all()).toHaveLength(76);
  });

  it('holds five customers with their line counts', () => {
    expect(history.customers().map((c) => [c.customerId, c.orderCount])).toEqual([
      ['CUST-001', 18],
      ['CUST-002', 17],
      ['CUST-003', 17],
      ['CUST-004', 18],
      ['CUST-005', 6],
    ]);
  });

  it('reports 2026-04-25 as the latest order date', () => {
    expect(history.latestOrderDate()).toBe('2026-04-25');
  });

  it('reads every quantity as a number', () => {
    expect(history.all().every((l) => Number.isInteger(l.quantity) && l.quantity > 0)).toBe(true);
  });
});
