import { beforeEach, describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../../src/adapters/csv/csvCatalogRepository';
import { CsvOrderHistoryRepository } from '../../src/adapters/csv/csvOrderHistoryRepository';
import { InMemoryCatalogRepository } from '../../src/adapters/memory/inMemoryCatalogRepository';
import { InMemoryOrderHistoryRepository } from '../../src/adapters/memory/inMemoryOrderHistoryRepository';
import type { CatalogItem, HistoryLine } from '../../src/domain/catalog';
import type { DescriptionParser } from '../../src/domain/contracts';
import type { ParsedSpec } from '../../src/domain/spec';
import type { CatalogRepository } from '../../src/ports/catalogRepository';
import type { OrderHistoryRepository } from '../../src/ports/orderHistoryRepository';

const emptySpec = (): ParsedSpec => ({ residue: [], evidence: {}, provenance: {} });

const stubParser: DescriptionParser = { parse: () => emptySpec() };

const item = (
  catalogId: string,
  sku: string,
  description: string,
  active: boolean,
): CatalogItem => ({
  catalogId,
  sku,
  description,
  active,
  spec: emptySpec(),
});

const ITEMS: CatalogItem[] = [
  item('CAT-0001', 'PXHEX1', '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC', true),
  item('CAT-0002', 'PXNUT1', 'm12-1.75 hex nut steel zinc', true),
  item('CAT-0003', 'PXWASH1', 'M8 FLAT WASHER, 18-8 SS PLAIN', false),
  item('CAT-0004', 'PXHEX1', '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC', true),
];

const LINES: HistoryLine[] = [
  {
    customerId: 'CUST-001',
    customerName: 'Midwest Industrial Supply',
    orderDate: '2025-08-12',
    sku: 'PXHEX1',
    description: '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC',
    quantity: 50,
  },
  {
    customerId: 'CUST-001',
    customerName: 'Midwest Industrial Supply',
    orderDate: '2026-01-09',
    sku: 'PXNUT1',
    description: 'm12-1.75 hex nut steel zinc',
    quantity: 10,
  },
  {
    customerId: 'CUST-002',
    customerName: 'CleanRoom Pharma MFG',
    orderDate: '2025-12-02',
    sku: 'PXWASH1',
    description: 'M8 FLAT WASHER, 18-8 SS PLAIN',
    quantity: 5,
  },
];

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

const catalogCsv = [
  'catalog_id,sku,catalog_description,active',
  ...ITEMS.map((i) => [i.catalogId, i.sku, quote(i.description), i.active ? 'Y' : 'N'].join(',')),
].join('\n');

const historyCsv = [
  'customer_id,customer_name,order_date,sku,catalog_description,quantity',
  ...LINES.map((l) =>
    [
      l.customerId,
      quote(l.customerName),
      l.orderDate,
      l.sku,
      quote(l.description),
      l.quantity,
    ].join(','),
  ),
].join('\n');

// Both families are fed the same data, so any disagreement is the adapter's, not the fixture's.
const FAMILIES = [
  {
    name: 'csv',
    catalog: () => CsvCatalogRepository.fromText(catalogCsv, stubParser),
    history: () => CsvOrderHistoryRepository.fromText(historyCsv),
  },
  {
    name: 'in-memory',
    catalog: () => new InMemoryCatalogRepository(ITEMS),
    history: () => new InMemoryOrderHistoryRepository(LINES),
  },
] as const;

describe.each(FAMILIES)('$name catalog repository', (family) => {
  let catalog: CatalogRepository;

  beforeEach(() => {
    catalog = family.catalog();
  });

  it('returns one item per SKU, keeping the first catalog id', () => {
    expect(catalog.all().map((i) => i.sku)).toEqual(['PXHEX1', 'PXNUT1', 'PXWASH1']);
    expect(catalog.bySku('PXHEX1')?.catalogId).toBe('CAT-0001');
  });

  it('includes inactive items in all()', () => {
    expect(catalog.all().find((i) => i.sku === 'PXWASH1')?.active).toBe(false);
  });

  it('excludes inactive items from active()', () => {
    expect(catalog.active().map((i) => i.sku)).toEqual(['PXHEX1', 'PXNUT1']);
  });

  it('finds an item by SKU and reports an unknown one as undefined', () => {
    expect(catalog.bySku('PXNUT1')?.description).toBe('m12-1.75 hex nut steel zinc');
    expect(catalog.bySku('NOPE')).toBeUndefined();
  });

  it('keeps the description exactly as written, case and inch mark included', () => {
    expect(catalog.bySku('PXHEX1')?.description).toBe('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');
    expect(catalog.bySku('PXNUT1')?.description).toBe('m12-1.75 hex nut steel zinc');
  });

  it('is unaffected by a caller mutating what it returned', () => {
    const first = catalog.all() as CatalogItem[];
    first.pop();

    expect(catalog.all()).toHaveLength(3);
  });
});

describe.each(FAMILIES)('$name order history repository', (family) => {
  let history: OrderHistoryRepository;

  beforeEach(() => {
    history = family.history();
  });

  it('returns every line', () => {
    expect(history.all()).toHaveLength(3);
  });

  it('returns the lines of one customer and nothing for an unknown one', () => {
    expect(history.byCustomer('CUST-001').map((l) => l.sku)).toEqual(['PXHEX1', 'PXNUT1']);
    expect(history.byCustomer('CUST-404')).toEqual([]);
  });

  it('summarises each customer with a line count and their last order date', () => {
    expect(history.customers()).toEqual([
      {
        customerId: 'CUST-001',
        customerName: 'Midwest Industrial Supply',
        orderCount: 2,
        lastOrderDate: '2026-01-09',
      },
      {
        customerId: 'CUST-002',
        customerName: 'CleanRoom Pharma MFG',
        orderCount: 1,
        lastOrderDate: '2025-12-02',
      },
    ]);
  });

  it('reports the latest order date in the data', () => {
    expect(history.latestOrderDate()).toBe('2026-01-09');
  });

  it('parses the quantity as a number', () => {
    expect(history.all()[0]?.quantity).toBe(50);
  });

  it('is unaffected by a caller mutating what it returned', () => {
    const lines = history.byCustomer('CUST-001') as HistoryLine[];
    lines.pop();

    expect(history.byCustomer('CUST-001')).toHaveLength(2);
  });
});
