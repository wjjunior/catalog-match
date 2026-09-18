import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { normalizeQuery, parseEvalJsonl } from '../data/eval/schema';
import { dedupeBySku, parseCsv, toCatalogRows } from './profile';

const ROOT = new URL('../', import.meta.url);

const readOptional = (path: string): string | null => {
  try {
    return readFileSync(new URL(path, ROOT), 'utf8');
  } catch {
    return null;
  }
};

const cases = parseEvalJsonl(readFileSync(new URL('data/eval/heldout.jsonl', ROOT), 'utf8'));

const catalog = dedupeBySku(
  toCatalogRows(parseCsv(readFileSync(new URL('data/catalog.csv', ROOT), 'utf8'))),
);
const bySku = new Map(catalog.map((row) => [row.sku, row]));

// The golden set is PRG-31 and may not exist yet, so the disjointness rule is also checked
// against the two sources PRG-31 seeds from: the 33 example queries and the adversarial
// queries enumerated in docs/BRIEF.md 11. Once golden.jsonl lands it is checked as well.
const GOLDEN_SEED_QUERIES = [
  'M8 flat washer',
  '5/16 hex nut',
  '1/2 inch hex nut',
  'M6 hex nuts',
  'SHCS 7/16 x 2-1/2',
  '1/2 rod 6 foot',
  'HHB 3/4-10 x 5/8',
  'lock washer 5/8',
  'M8 x 16 hex cap screw',
  'M16 threaded rod 60mm',
  '5/8 flat washer',
  'M12 x 50mm button socket',
  '#8-32 lock washer',
  '1/4-20 x 3/4 hex cap screw zinc',
  'M4 x 16mm socket head cap screw',
  '3/8 lag screw 1 inch',
  'M5 x 30 threaded rod',
  '7/16-14 phillips pan machine screw 1-1/4',
  '5/16-18 flat washer',
  'M10 x 60mm lag screw',
  'M8 x 50mm BHCS',
  '3/4-10 tap bolt 5/8',
  'M12 hex nut',
  '1/2-13 x 3 lag screw',
  'M6 x 50mm tap bolt',
  '#10-24 x 1/2 threaded rod',
  '5/8-11 x 3/8 lag screw',
  'M16 x 8mm pan head machine screw',
  '3/8-16 x 4 hex bolt',
  'M4 hex nut',
  'M8 x 50mm button socket cap screw alloy black oxide',
  'brass hex nut 1/2-13',
  'the same washers as last time',
  'M14 hex nut',
  '1/2-20 hex nut',
  '#6-32 screw',
  'carriage bolt 3/8',
  'wing nut M6',
  'nylon lock nut M8',
  'M8 x 45mm shcs',
  'M8 hex nut nylon insert',
  'grade 8 1/2-13 hex nut',
  'stainless M8 washer',
  'galvanized 3/8 lag 1-1/2',
  'zinc plated 1/4-20 x 3/4 hex bolt',
  '304 ss M6 nut',
  '12 millimeter hex nut',
  '1/2"',
  '6 ft',
  'M8 x 3/4 hex cap screw',
  'washr',
  'hex nutt',
  'socket haed',
  'please quote 200 pcs of M8 x 50 BHCS black oxide',
  'M8 flat washer DIN 912',
];

describe('held-out set', () => {
  it('holds 15 to 20 cases with unique ids', () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
    expect(cases.length).toBeLessThanOrEqual(20);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  });

  it('records a rationale and at least one tag for every case', () => {
    for (const item of cases) {
      expect(item.rationale, item.id).toBeTruthy();
      expect(item.tags.length, item.id).toBeGreaterThan(0);
    }
  });

  it('covers every match status', () => {
    const seen = new Set(cases.map((item) => item.expectedStatus));
    expect([...seen].sort()).toEqual(['ambiguous', 'history', 'none', 'unique', 'unparsed']);
  });

  it('sizes the expected list to match the expected status', () => {
    for (const item of cases) {
      const size = item.expected.length;
      if (item.expectedStatus === 'unique') expect(size, item.id).toBe(1);
      if (item.expectedStatus === 'ambiguous') expect(size, item.id).toBeGreaterThanOrEqual(2);
      if (item.expectedStatus === 'none') expect(size, item.id).toBe(0);
      if (item.expectedStatus === 'unparsed') expect(size, item.id).toBe(0);
    }
  });

  it('names only catalog SKUs, and only active ones outside history candidates', () => {
    for (const item of cases) {
      for (const sku of item.expected) {
        const row = bySku.get(sku);
        expect(row, `${item.id} ${sku}`).toBeDefined();
        if (item.expectedStatus !== 'history') expect(row?.active, `${item.id} ${sku}`).toBe(true);
      }
    }
  });

  it('names a customer for every history-dependent case and for no other', () => {
    for (const item of cases) {
      const dependsOnHistory = item.tags.includes('history');
      expect(item.customerId !== undefined, item.id).toBe(dependsOnHistory);
    }
  });

  it('repeats no query within the set', () => {
    const normalized = cases.map((item) => normalizeQuery(item.query));
    expect(new Set(normalized).size).toBe(cases.length);
  });

  it('shares no query with the golden seed queries', () => {
    const golden = new Set(GOLDEN_SEED_QUERIES.map(normalizeQuery));
    const shared = cases.filter((item) => golden.has(normalizeQuery(item.query)));
    expect(shared.map((item) => item.id)).toEqual([]);
  });

  it('shares no query with data/eval/golden.jsonl once that file exists', () => {
    const text = readOptional('data/eval/golden.jsonl');
    if (text === null) {
      expect(cases.length).toBeGreaterThan(0);
      return;
    }
    const golden = new Set(parseEvalJsonl(text).map((item) => normalizeQuery(item.query)));
    const shared = cases.filter((item) => golden.has(normalizeQuery(item.query)));
    expect(shared.map((item) => item.id)).toEqual([]);
  });
});
