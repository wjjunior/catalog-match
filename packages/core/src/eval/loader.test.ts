import { describe, expect, it } from 'vitest';

import { InMemoryCatalogRepository } from '../adapters/memory/inMemoryCatalogRepository';
import type { CatalogItem } from '../domain/catalog';
import { descriptionParser } from '../parsing/descriptionParser';
import type { EvalCase } from './loader';
import { EvalDataError, intendedSku, loadCases } from './loader';

const item = (sku: string, description: string, active = true): CatalogItem => ({
  catalogId: sku,
  sku,
  description,
  active,
  spec: descriptionParser.parse(description),
});

const catalog = new InMemoryCatalogRepository([
  item('A', 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN'),
  item('B', 'M8-1.25 FLAT WSHR DIN 912 A2 SS BLACK OXIDE'),
  item('GONE', 'M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN', false),
]);

const tie = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  id: 'c-01',
  query: 'M8 flat washer',
  expectedStatus: 'ambiguous',
  expected: ['A', 'B'],
  tags: ['tie'],
  ...overrides,
});

const load = (overrides: Partial<EvalCase> = {}): readonly EvalCase[] =>
  loadCases([tie(overrides)], catalog);

describe('a case the catalog can account for', () => {
  it('passes through unchanged, in the order it arrived', () => {
    const cases = [tie({ id: 'c-01' }), tie({ id: 'c-02', expected: ['B'] })];

    expect(loadCases(cases, catalog)).toEqual(cases);
  });

  it('accepts a SKU the catalog has dropped, which a referenced order still names', () => {
    expect(load({ expected: ['GONE'] })).toHaveLength(1);
  });

  it('accepts a case that labels no SKU at all, as a status-only row does', () => {
    expect(load({ expected: [], expectedStatus: 'none', tags: ['status-only'] })).toHaveLength(1);
  });
});

describe('a SKU the catalog does not have', () => {
  it('names the case and the SKU rather than failing later on a lookup', () => {
    expect(() => load({ expected: ['A', 'NOPE'] })).toThrow(
      new EvalDataError('c-01: expected SKU NOPE is not in the catalog'),
    );
  });

  it('is reported for expectedTop1 too', () => {
    expect(() => load({ expectedTop1: 'NOPE' })).toThrow(
      new EvalDataError('c-01: expectedTop1 SKU NOPE is not in the catalog'),
    );
  });

  it('is reported for expectedAlternatives too', () => {
    expect(() => load({ expectedAlternatives: ['NOPE'] })).toThrow(
      new EvalDataError('c-01: expectedAlternatives SKU NOPE is not in the catalog'),
    );
  });

  it('is reported for the first offending case, named by its own id', () => {
    expect(() => loadCases([tie(), tie({ id: 'c-09', expected: ['NOPE'] })], catalog)).toThrow(
      new EvalDataError('c-09: expected SKU NOPE is not in the catalog'),
    );
  });
});

describe('a label that contradicts itself', () => {
  // The intended item has to be one of the acceptable ones, or the retrieval metric and
  // the set metric would be scored against different answers. docs/eval/golden-rationale.md 3.
  it('rejects an expectedTop1 that is not among the expected set', () => {
    expect(() => load({ expected: ['A'], expectedTop1: 'B' })).toThrow(
      new EvalDataError('c-01: expectedTop1 B is not in expected'),
    );
  });

  it('rejects a repeated SKU, which would double its weight in set recall', () => {
    expect(() => load({ expected: ['A', 'B', 'A'] })).toThrow(
      new EvalDataError('c-01: expected repeats A'),
    );
  });
});

describe('the SKU a case intends', () => {
  it('is the one the label names first, where it names one', () => {
    expect(intendedSku(tie({ expectedTop1: 'B' }))).toBe('B');
  });

  it('is the single member of a set of one, which needs no second field', () => {
    expect(intendedSku(tie({ expected: ['A'], expectedStatus: 'unique' }))).toBe('A');
  });

  // A tie query without a top-1 label has acceptable answers and no intended one, so
  // retrieval and calibration must leave it out rather than pick a member. DESIGN 10.2.
  it('is absent for a set of several with no top-1 named', () => {
    expect(intendedSku(tie())).toBeUndefined();
  });

  it('is absent when the case labels no SKU at all', () => {
    expect(intendedSku(tie({ expected: [] }))).toBeUndefined();
  });
});
