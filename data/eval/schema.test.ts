import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { EXAMPLE_QUERIES } from '../../packages/core/test/fixtures/example-queries';
import { activeSkus } from '../../scripts/expected-sets';
import type { Filter } from '../../scripts/expected-sets';
import { dedupeBySku, parseCsv, toCatalogRows } from '../../scripts/profile';
import { EvalSchemaError, parseEvalCase, parseEvalJsonl } from './schema';

const WELL_FORMED = {
  id: 'ex-01',
  query: 'M8 flat washer',
  expectedStatus: 'ambiguous',
  expected: ['PXWASH812A2YZ0016', 'PXWASH816A2BO0624'],
  tags: ['example', 'tie'],
};

const parse = (patch: Record<string, unknown>) =>
  parseEvalCase({ ...WELL_FORMED, ...patch }, 'test');

// The two optional fields PRG-31 adds to the schema PRG-32 defined. The rest of the
// parser is covered by scripts/heldout.test.ts against the held-out set.
describe('parseEvalCase, the fields the golden set adds', () => {
  it('accepts a row that carries neither', () => {
    expect(parse({}).expectedTop1).toBeUndefined();
  });

  it('keeps expectedTop1 and expectedAlternatives when they are present', () => {
    const row = parse({
      expectedTop1: 'PXWASH812A2YZ0016',
      expectedStatus: 'none',
      expected: [],
      expectedAlternatives: ['PXHEX816ALBO0387'],
    });
    expect(row.expectedTop1).toBe('PXWASH812A2YZ0016');
    expect(row.expectedAlternatives).toEqual(['PXHEX816ALBO0387']);
  });

  it('rejects an expectedTop1 that is not a non-empty string', () => {
    expect(() => parse({ expectedTop1: '' })).toThrow(EvalSchemaError);
    expect(() => parse({ expectedTop1: 7 })).toThrow(EvalSchemaError);
  });

  it('rejects expectedAlternatives that is not an array of strings', () => {
    expect(() => parse({ expectedAlternatives: 'PXHEX816ALBO0387' })).toThrow(EvalSchemaError);
    expect(() => parse({ expectedAlternatives: [7] })).toThrow(EvalSchemaError);
  });

  it('still rejects a field it does not know', () => {
    expect(() => parse({ expectedTop2: 'PXWASH812A2YZ0016' })).toThrow(EvalSchemaError);
  });
});

const text = readFileSync(new URL('golden.jsonl', import.meta.url), 'utf8');

const cases = parseEvalJsonl(text);

const catalog = new Map(
  dedupeBySku(
    toCatalogRows(parseCsv(readFileSync(new URL('../catalog.csv', import.meta.url), 'utf8'))),
  ).map((row) => [row.sku, row]),
);

const ADVERSARIAL_CLASSES = [
  'unknown-diameter',
  'unknown-type',
  'unknown-length',
  'residue',
  'synonym',
  'unit-form',
  'typo',
  'noise',
  'casing',
  'permutation',
  'standard',
] as const;

const TAGS = new Set<string>([
  'example',
  'personalized',
  'adversarial',
  'tie',
  'discontinued',
  'history-reference',
  'override',
  'status-only',
  ...ADVERSARIAL_CLASSES,
]);

const TIE_FILTERS: [string, Filter][] = [
  ['ex-01', { diameter: 'M8', types: ['WASH'] }],
  ['ex-02', { diameter: '5/16', types: ['NUT'] }],
  ['ex-03', { diameter: '1/2', types: ['NUT'] }],
  ['ex-04', { diameter: 'M6', types: ['NUT'] }],
  ['ex-08', { diameter: '5/8', types: ['LOCK'] }],
  ['ex-11', { diameter: '5/8', types: ['WASH'] }],
  ['ex-13', { diameter: '#8', types: ['LOCK'] }],
  ['ex-19', { diameter: '5/16', types: ['WASH'] }],
  ['ex-23', { diameter: 'M12', types: ['NUT'] }],
  ['ex-30', { diameter: 'M4', types: ['NUT'] }],
];

describe('golden.jsonl', () => {
  it('parses every line against the schema', () => {
    expect(() => parseEvalJsonl(text)).not.toThrow();
    expect(cases).toHaveLength(78);
  });

  it('numbers its ids by block, with no repeats', () => {
    expect(new Set(cases.map((row) => row.id)).size).toBe(cases.length);
    expect(cases.filter((row) => !/^(ex|pers|adv)-\d{2}$/.test(row.id))).toEqual([]);
    expect(cases.filter((row) => row.id.startsWith('ex-'))).toHaveLength(33);
    expect(cases.filter((row) => row.id.startsWith('pers-'))).toHaveLength(21);
    expect(cases.filter((row) => row.id.startsWith('adv-'))).toHaveLength(24);
  });

  it('draws every tag from the vocabulary', () => {
    for (const row of cases) {
      expect(row.tags.length, row.id).toBeGreaterThan(0);
      expect(new Set(row.tags).size, row.id).toBe(row.tags.length);
      expect(
        row.tags.filter((tag) => !TAGS.has(tag)),
        row.id,
      ).toEqual([]);
    }
  });

  // docs/DESIGN.md 5.3 decides status from the compatible set, so the size of `expected`
  // is not free: it is what the status means. The status-only rows are the one exemption,
  // and they are the rows whose set runs to 86 items or more.
  it('sizes the expected list to match the expected status', () => {
    const seen = new Set<string>();
    for (const row of cases) {
      seen.add(row.expectedStatus);
      const statusOnly = row.tags.includes('status-only');
      if (row.expectedStatus === 'unique') expect(row.expected, row.id).toHaveLength(1);
      if (row.expectedStatus === 'ambiguous' && statusOnly) {
        expect(row.expected, row.id).toHaveLength(0);
      }
      if (row.expectedStatus === 'ambiguous' && !statusOnly) {
        expect(row.expected.length, row.id).toBeGreaterThanOrEqual(2);
      }
      if (row.expectedStatus === 'none' || row.expectedStatus === 'unparsed') {
        expect(row.expected, row.id).toHaveLength(0);
      }
      if (row.expectedStatus === 'history') {
        expect(row.expected.length > 0, row.id).toBe(row.customerId !== undefined);
      }
    }
    expect([...seen].sort()).toEqual(['ambiguous', 'history', 'none', 'unique', 'unparsed']);
    expect(cases.filter((row) => row.tags.includes('status-only'))).toHaveLength(4);
  });

  it('keeps expectedTop1 inside expected, and alternatives to rows that matched nothing', () => {
    const withTop1 = cases.filter((row) => row.expectedTop1 !== undefined);
    expect(withTop1.length).toBeGreaterThan(0);
    for (const row of withTop1) expect(row.expected, row.id).toContain(row.expectedTop1);

    const withAlternatives = cases.filter((row) => row.expectedAlternatives !== undefined);
    expect(withAlternatives.length).toBeGreaterThan(0);
    for (const row of withAlternatives) expect(row.expectedStatus, row.id).toBe('none');
  });

  it('names no SKU twice in one list', () => {
    for (const row of cases) {
      expect(new Set(row.expected).size, row.id).toBe(row.expected.length);
      const alternatives = row.expectedAlternatives ?? [];
      expect(new Set(alternatives).size, row.id).toBe(alternatives.length);
    }
  });

  it('names only SKUs that exist in the catalog', () => {
    const named = cases.flatMap((row) => [
      ...row.expected,
      ...(row.expectedAlternatives ?? []),
      ...(row.expectedTop1 === undefined ? [] : [row.expectedTop1]),
    ]);
    expect(named.length).toBeGreaterThan(0);
    expect(named.filter((sku) => !catalog.has(sku))).toEqual([]);
  });

  it('names only active SKUs unless the row is tagged discontinued', () => {
    const offenders = cases
      .filter((row) => !row.tags.includes('discontinued'))
      .flatMap((row) => row.expected)
      .filter((sku) => catalog.get(sku)?.active !== true);
    expect(offenders).toEqual([]);

    // No row relies on the exemption today. Recorded so that the first one to rely on it
    // is a visible change rather than a silent loss of the check above.
    const relying = cases
      .filter((row) => row.tags.includes('discontinued'))
      .flatMap((row) => row.expected)
      .filter((sku) => catalog.get(sku)?.active !== true);
    expect(relying).toEqual([]);
  });

  it('keeps the example queries identical to the parser fixtures', () => {
    const examples = cases.filter((row) => row.id.startsWith('ex-'));
    expect(examples.map((row) => row.query)).toEqual(EXAMPLE_QUERIES.map((row) => row.query));
  });

  it('derives every tie row from the catalog', () => {
    for (const [id, filter] of TIE_FILTERS) {
      const row = cases.find((one) => one.id === id);
      expect(row?.expected, id).toEqual(activeSkus(filter));
    }

    const ambiguousExamples = cases.filter(
      (one) => one.id.startsWith('ex-') && one.expectedStatus === 'ambiguous',
    );
    expect(TIE_FILTERS.map(([id]) => id)).toEqual(ambiguousExamples.map((one) => one.id));
  });

  it('reproduces the M8 flat washer anchor of docs/data-profile.md', () => {
    expect(cases.find((row) => row.id === 'ex-01')?.expected).toHaveLength(7);
  });

  it('gives every personalized row a customer and a hand-written rationale', () => {
    const personalized = cases.filter((row) => row.id.startsWith('pers-'));
    expect(personalized).toHaveLength(21);
    for (const row of personalized) {
      expect(row.customerId, row.id).toBeDefined();
      expect(row.rationale?.trim(), row.id).toBeTruthy();
    }
    // The converse: a customer anywhere in the file obliges a rationale.
    for (const row of cases.filter((one) => one.customerId !== undefined)) {
      expect(row.rationale?.trim(), row.id).toBeTruthy();
    }
  });

  it('names a customer that appears in the order history', () => {
    const history = new Set(
      parseCsv(readFileSync(new URL('../order_history.csv', import.meta.url), 'utf8')).map(
        (row) => row.customer_id,
      ),
    );
    const named = cases.map((row) => row.customerId).filter((id) => id !== undefined);
    expect(named).toHaveLength(21);
    expect(named.filter((id) => !history.has(id))).toEqual([]);
  });

  it('covers all five customers on the M8 flat washer showcase', () => {
    const showcase = cases.filter(
      (row) => row.query === 'M8 flat washer' && row.customerId !== undefined,
    );
    expect(showcase.map((row) => row.customerId).sort()).toEqual([
      'CUST-001',
      'CUST-002',
      'CUST-003',
      'CUST-004',
      'CUST-005',
    ]);
    // docs/DESIGN.md 3.3: five customers, four distinct answers.
    expect(new Set(showcase.map((row) => row.expectedTop1)).size).toBe(4);
  });

  it('holds at least 20 adversarial rows covering every class', () => {
    const adversarial = cases.filter((row) => row.id.startsWith('adv-'));
    expect(adversarial.length).toBeGreaterThanOrEqual(20);
    const covered = new Set(adversarial.flatMap((row) => row.tags));
    expect(ADVERSARIAL_CLASSES.filter((name) => !covered.has(name))).toEqual([]);
  });
});
