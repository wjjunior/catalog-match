import { describe, expect, it } from 'vitest';

import { createCoreFromRepositories } from '../../src/application/createCore';
import { InMemoryCatalogRepository } from '../../src/adapters/memory/inMemoryCatalogRepository';
import { InMemoryOrderHistoryRepository } from '../../src/adapters/memory/inMemoryOrderHistoryRepository';
import type { MatchResponse } from '../../src/domain/match';
import { buildIndex, LexicalOnlyMatcher } from '../../src/matching/lexicalFallback';
import type { Matcher } from '../../src/ports/matcher';
import { EXAMPLE_QUERIES } from '../fixtures/example-queries';
import { core } from './setup';

const ask = (query: string, customerId?: string): MatchResponse =>
  core.matchQuery(customerId === undefined ? { query } : { query, customerId });

const skus = (response: MatchResponse): string[] => response.results.map((match) => match.sku);

/** The 22 example queries that resolve to one SKU, with the SKU the catalog holds.
 * docs/DESIGN.md 3.3. */
const UNIQUE: Readonly<Record<string, string>> = {
  'SHCS 7/16 x 2-1/2': 'PXSOC716212STZC0375',
  '1/2 rod 6 foot': 'PXROD126STZC0002',
  'HHB 3/4-10 x 5/8': 'PXTAP3458STZC0384',
  'M8 x 16 hex cap screw': 'PXHEX816ALBO0387',
  'M16 threaded rod 60mm': 'PXROD1660ALBO0244',
  'M12 x 50mm button socket': 'PXBTN1250ALBO0083',
  '1/4-20 x 3/4 hex cap screw zinc': 'PXHEX1434STZC0003',
  'M4 x 16mm socket head cap screw': 'PXSOC41688PL0685',
  '3/8 lag screw 1 inch': 'PXLAG381BRPL0136',
  'M5 x 30 threaded rod': 'PXROD530BRMZ0014',
  '7/16-14 phillips pan machine screw 1-1/4': 'PXPAN716114ALBO0029',
  'M10 x 60mm lag screw': 'PXLAG1060BRZC0148',
  'M8 x 50mm BHCS': 'PXBTN850ALBO0100',
  '3/4-10 tap bolt 5/8': 'PXTAP3458STZC0384',
  '1/2-13 x 3 lag screw': 'PXLAG12388PL0842',
  'M6 x 50mm tap bolt': 'PXTAP65088PL0765',
  '#10-24 x 1/2 threaded rod': 'PXRODN1012ALBO0215',
  '5/8-11 x 3/8 lag screw': 'PXLAG5838BRZC0087',
  'M16 x 8mm pan head machine screw': 'PXPAN168BRHG0076',
  '3/8-16 x 4 hex bolt': 'PXHEX384BRMZ0072',
  'M8 x 50mm button socket cap screw alloy black oxide': 'PXBTN850ALBO0100',
  'brass hex nut 1/2-13': 'PXNUT123BRZC0107',
};

/** The nut and washer queries: diameter and type only, so what is left differs by
 * material, finish and standard. */
const AMBIGUOUS: Readonly<Record<string, number>> = {
  'M8 flat washer': 7,
  '5/16 hex nut': 5,
  '1/2 inch hex nut': 5,
  'M6 hex nuts': 4,
  'lock washer 5/8': 7,
  '5/8 flat washer': 4,
  '#8-32 lock washer': 6,
  '5/16-18 flat washer': 9,
  'M12 hex nut': 9,
  'M4 hex nut': 2,
};

const HISTORY_REFERENCE = 'the same washers as last time';

describe('the example set', () => {
  it('is covered query for query by the expectations below', () => {
    const covered = [...Object.keys(UNIQUE), ...Object.keys(AMBIGUOUS), HISTORY_REFERENCE];

    expect(covered.toSorted()).toEqual(EXAMPLE_QUERIES.map((fixture) => fixture.query).toSorted());
  });

  it('resolves 22 of its 33 queries to exactly one SKU', () => {
    expect(Object.keys(UNIQUE)).toHaveLength(22);
    expect(Object.keys(AMBIGUOUS)).toHaveLength(10);
  });

  it.each(Object.entries(UNIQUE))('answers %s uniquely', (query, sku) => {
    const response = ask(query);

    expect(response.status).toBe('unique');
    expect(response.compatibleCount).toBe(1);
    expect(skus(response)).toEqual([sku]);
  });

  it.each(Object.entries(AMBIGUOUS))('answers %s with %i compatible SKUs', (query, count) => {
    const response = ask(query);

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(count);
    expect(response.results).toHaveLength(Math.min(3, count));
    expect(response.results[0]?.explanation.compatibleCount).toBe(count);
    expect(response.results[0]?.explanation.disambiguateBy.length).toBeGreaterThan(0);
  });

  it.each([...Object.keys(UNIQUE), ...Object.keys(AMBIGUOUS)])(
    'never fills %s past three cards, and never with a compatible item',
    (query) => {
      const response = ask(query);
      const compatible = new Set(skus(response));

      expect(response.results.length + response.alternatives.length).toBeLessThanOrEqual(3);
      expect(response.alternatives.filter((option) => compatible.has(option.sku))).toEqual([]);
      expect(response.alternatives.filter((option) => option.relaxed.length === 0)).toEqual([]);
      expect(response.alternatives.filter((option) => 'confidence' in option)).toEqual([]);
    },
  );

  it('follows a unique match with the two nearest near misses', () => {
    const response = ask('M16 threaded rod 60mm');

    expect(response.status).toBe('unique');
    expect(response.results).toHaveLength(1);
    expect(response.alternatives).toHaveLength(2);
    for (const option of response.alternatives) {
      expect(option.relaxed).toEqual(['length']);
      expect(option.closeness).toBeLessThan(1);
      expect(option.explanation.closeness).toBe(option.closeness);
    }
  });

  it('fills a two-item compatible set to three', () => {
    const response = ask('M8 x 16mm socket head cap screw');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(2);
    expect(response.results).toHaveLength(2);
    expect(response.alternatives).toHaveLength(1);
    expect(response.alternatives[0]?.relaxed).toEqual(['length']);
  });

  /** Diameter and type are never relaxed, so a query that states nothing else has no
   * near miss to offer and the panel stays short of three. docs/DESIGN.md 5.3. */
  it('offers nothing where the query left the backoff no step to take', () => {
    const response = ask('M4 hex nut');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(2);
    expect(response.alternatives).toEqual([]);
  });

  it('leaves a compatible set of three or more alone', () => {
    const response = ask('M8 flat washer');

    expect(response.status).toBe('ambiguous');
    expect(response.results).toHaveLength(3);
    expect(response.alternatives).toEqual([]);
  });

  it('keeps a near miss out of the results it follows', () => {
    const response = ask('M8 flat washer DIN 912');
    const ranked = new Set(skus(response));

    expect(response.status).toBe('unique');
    expect(response.alternatives.length).toBeGreaterThan(0);
    expect(response.alternatives.some((option) => ranked.has(option.sku))).toBe(false);
    expect(response.alternatives.every((option) => option.relaxed.includes('standard'))).toBe(true);
  });

  it('answers a history reference without a customer with the prompt', () => {
    const response = ask(HISTORY_REFERENCE);

    expect(response.status).toBe('history');
    expect(response.results).toEqual([]);
    expect(response.notes).toEqual([
      { code: 'customerRequired', message: "select a customer to resolve 'last time'" },
    ]);
  });
});

describe('docs/DESIGN.md 6, without a customer', () => {
  it('reads an abbreviation as the expanded form', () => {
    const response = ask('SHCS 7/16 x 2-1/2');

    expect(response.status).toBe('unique');
    expect(response.results[0]?.confidence).toBeCloseTo(0.98, 2);
  });

  it('names the one item a family shorthand can mean', () => {
    const response = ask('HHB 3/4-10 x 5/8');
    const type = response.results[0]?.explanation.matched.find((attr) => attr.attr === 'type');

    expect(response.status).toBe('unique');
    expect(type?.item).toBe('tap bolt');
    // Two readings of HHB survived the parse; only one of them is in the catalog at
    // this size, and the chip says the agreement is partial.
    expect(type?.partial).toBe(true);
  });

  it('leaves a query missing attributes ambiguous, with what would settle it', () => {
    const response = ask('M8 flat washer');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(7);
    expect(response.results[0]?.confidence).toBeCloseTo(0.14, 2);
    expect(response.results[0]?.explanation.disambiguateBy).toEqual([
      'material',
      'finish',
      'standard',
    ]);
  });

  it('answers vague text with a large compatible set and low values', () => {
    const response = ask('big brass bolt');

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBeGreaterThan(20);
    expect(response.results[0]?.confidence).toBeLessThan(0.1);
    expect(response.notes).toContainEqual({
      code: 'unverifiedResidue',
      message: 'not verifiable: big',
    });
  });

  it.each([
    ['M8 hex nut nylon insert', 'M8 hex nut', 'nylon, insert'],
    ['grade 8 1/2-13 hex nut', '1/2-13 hex nut', 'grade, 8'],
  ])(
    'keeps C and its order when %s carries a token the catalog has no place for',
    (query, plain, unverified) => {
      const response = ask(query);
      const without = ask(plain);

      expect(response.status).toBe('ambiguous');
      expect(response.compatibleCount).toBe(without.compatibleCount);
      expect(skus(response)).toEqual(skus(without));
      expect(response.notes).toContainEqual({
        code: 'unverifiedResidue',
        message: `not verifiable: ${unverified}`,
      });
      // The residue raises the null term, so every value drops without reordering.
      expect(response.results[0]?.confidence).toBeLessThan(without.results[0]?.confidence ?? 0);
    },
  );

  it('names the failed constraint and offers approximate lengths for a size not stocked', () => {
    const response = ask('M8 x 45mm SHCS');

    expect(response.status).toBe('none');
    expect(response.results).toEqual([]);
    expect(response.notes).toContainEqual({
      code: 'failedConstraint',
      message: 'no M8 socket head cap screw at 45 mm',
    });
    expect(response.alternatives).toHaveLength(3);
    expect(
      response.alternatives.every((alternative) => alternative.relaxed.includes('length')),
    ).toBe(true);
  });

  it('answers a diameter the catalog does not carry with a note and nothing else', () => {
    const response = ask('M14 hex nut');

    expect(response.status).toBe('none');
    expect(response.alternatives).toEqual([]);
    expect(response.notes).toEqual([
      { code: 'unknownDiameter', message: 'M14 is not a diameter in this catalog' },
    ]);
  });

  it('reads a unit written out and infers the diameter from it', () => {
    const response = ask('12 millimeter hex nut');

    expect(response.status).toBe('ambiguous');
    expect(response.parsed.diameter?.nominal).toBe('M12');
    expect(response.parsed.provenance.diameter).toBe('inferred');
    expect(response.compatibleCount).toBe(AMBIGUOUS['M12 hex nut']);
  });

  it.each([
    ['washr', 'washer'],
    ['hex nutt', 'hex nut'],
    ['socket haed cap screw', 'socket head cap screw'],
  ])('answers %s as it answers %s', (typo, corrected) => {
    const response = ask(typo);

    expect(skus(response)).toEqual(skus(ask(corrected)));
    expect(response.compatibleCount).toBe(ask(corrected).compatibleCount);
  });

  it('reports a length whose unit contradicts the diameter', () => {
    const response = ask('M8 x 3/4 hex cap screw');

    expect(response.status).toBe('none');
    expect(response.notes[0]).toEqual({
      code: 'unitMismatch',
      message: 'length given in inches for a metric diameter; treated as 19.05 mm',
    });
    expect(response.alternatives[0]?.relaxed).toEqual(['length']);
  });

  it('treats a named standard as a constraint', () => {
    const response = ask('M8 flat washer DIN 912');

    expect(response.status).toBe('unique');
    expect(skus(response)).toEqual(['PXWASH816A2BO0624']);
  });

  it('answers a fully specified query with one SKU near certainty', () => {
    const response = ask('1/4-20 x 3/4 hex cap screw zinc');

    expect(response.status).toBe('unique');
    expect(response.results[0]?.confidence).toBeCloseTo(0.98, 2);
    expect(response.results[0]?.explanation.unspecified).toEqual(['material']);
  });

  it('answers a type the catalog does not carry with a note and nothing else', () => {
    const response = ask('carriage bolt 3/8');

    expect(response.status).toBe('none');
    expect(response.alternatives).toEqual([]);
    expect(response.notes).toEqual([
      { code: 'unknownType', message: 'carriage bolt is not a product type in this catalog' },
    ]);
  });
});

/** What the response quotes back is what the rep typed, by design: an abbreviation and
 * its expansion cannot agree on the evidence. Everything the quoting does not touch must
 * be identical. */
const unquoted = <T extends { explanation: MatchResponse['results'][number]['explanation'] }>(
  card: T,
): unknown => ({
  ...card,
  explanation: {
    ...card.explanation,
    matched: card.explanation.matched.map((attr) => ({ ...attr, query: undefined })),
  },
});

const withoutQuoting = (response: MatchResponse): unknown => ({
  ...response,
  query: undefined,
  timingsMs: undefined,
  parsed: { ...response.parsed, evidence: undefined },
  results: response.results.map(unquoted),
  alternatives: response.alternatives.map(unquoted),
});

describe('abbreviations', () => {
  it.each([
    ['SHCS 7/16 x 2-1/2', 'socket head cap screw 7/16 x 2-1/2'],
    ['M8 x 50mm BHCS', 'M8 x 50mm button socket cap screw'],
  ])('answers %s exactly as it answers %s', (abbreviated, expanded) => {
    expect(withoutQuoting(ask(abbreviated))).toEqual(withoutQuoting(ask(expanded)));
  });
});

describe('the use case', () => {
  it('answers the same query the same way twice', () => {
    expect(withoutQuoting(ask('M8 flat washer'))).toEqual(withoutQuoting(ask('M8 flat washer')));
  });

  it('honours the limit it is given', () => {
    expect(core.matchQuery({ query: '5/16-18 flat washer', limit: 5 }).results).toHaveLength(5);
  });

  it('labels every match now the thresholds are measured, and calls a seven-way tie Low', () => {
    expect(core.config.labels.provisional).toBe(false);
    expect(ask('M8 flat washer').results.every((match) => match.label === 'Low')).toBe(true);
  });

  it('is the Matcher port', () => {
    const matcher: Matcher = { match: (request) => core.matchQuery(request) };

    expect(matcher.match({ query: 'M4 hex nut' }).status).toBe('ambiguous');
  });

  it('answers the example queries well under 50 ms at p95', () => {
    const queries = EXAMPLE_QUERIES.map((fixture) => fixture.query);
    for (const query of queries) ask(query);

    const timings = queries
      .map((query) => {
        const startedAt = performance.now();
        ask(query);
        return performance.now() - startedAt;
      })
      .toSorted((a, b) => a - b);

    expect(timings[Math.ceil(timings.length * 0.95) - 1] ?? 0).toBeLessThan(50);
  });
});

describe('the lexical fallback', () => {
  it('answers a query with neither diameter nor type, capped', () => {
    const response = ask('plain zinc');

    expect(response.status).toBe('unparsed');
    expect(response.compatibleCount).toBe(147);
    expect(response.results).toHaveLength(3);
    expect(response.results[0]?.confidence).toBeCloseTo(core.config.lexicalCap, 10);
    expect(response.results.every((match) => match.confidence <= core.config.lexicalCap)).toBe(
      true,
    );
    expect(response.results[0]?.explanation.compatibleCount).toBe(147);
  });

  it('ranks what the baseline of docs/DESIGN.md 10.4 ranks', () => {
    const baseline = new LexicalOnlyMatcher(buildIndex(core.catalog.active()), core.config);

    expect(skus(ask('plain zinc'))).toEqual(
      baseline.match({ query: 'plain zinc' }).results.map((match) => match.sku),
    );
  });

  it('never ranks a discontinued SKU', () => {
    const discontinued = core.catalog.bySku('PXSOC168A2YZ0034');
    const wired = createCoreFromRepositories({
      catalog: new InMemoryCatalogRepository(discontinued === undefined ? [] : [discontinued]),
      history: new InMemoryOrderHistoryRepository([]),
    });

    expect(discontinued?.active).toBe(false);
    // Every word of the query is in that one description, so an index built over the
    // whole catalog rather than the active part would answer with it.
    const response = wired.matchQuery({ query: 'a2 ss yel zn' });

    // No active item is left for the recognized attributes to admit, so the fallback
    // reports the failure rather than ranking. docs/DESIGN.md 5.8.
    expect(response.status).toBe('none');
    expect(response.results).toEqual([]);
  });

  it('names the pool it could not narrow when no token reaches the catalog', () => {
    const response = ask('blue widget');

    expect(response.status).toBe('unparsed');
    expect(response.compatibleCount).toBe(core.catalog.active().length);
    expect(response.results).toEqual([]);
    expect(response.notes).toEqual([
      {
        code: 'unrankedPool',
        message:
          'the query leaves 916 items compatible and nothing ranks them; name a diameter or a type',
      },
      { code: 'unverifiedResidue', message: 'not verifiable: blue, widget' },
    ]);
  });
});

describe('listCustomers', () => {
  it('answers every customer when asked for none in particular', () => {
    expect(core.listCustomers().map((customer) => customer.customerId)).toEqual([
      'CUST-001',
      'CUST-002',
      'CUST-003',
      'CUST-004',
      'CUST-005',
    ]);
  });

  it('puts a prefix match before a substring match', () => {
    expect(core.listCustomers('m').map((customer) => customer.customerName)).toEqual([
      'Midwest Industrial Supply',
      'Marine Electrical Corp',
      'CleanRoom Pharma MFG',
      'Heavy Machinery Solutions',
      'Summit General Maintenance',
    ]);
  });

  it('matches the customer id as well as the name', () => {
    expect(core.listCustomers('cust-003').map((customer) => customer.customerName)).toEqual([
      'Marine Electrical Corp',
    ]);
  });

  it('ignores case', () => {
    expect(core.listCustomers('MARINE')).toEqual(core.listCustomers('marine'));
  });

  it('answers nothing when nothing matches', () => {
    expect(core.listCustomers('zzz')).toEqual([]);
  });
});

describe('createCoreFromRepositories', () => {
  it('wires the same core over repositories held in memory', () => {
    const items = core.catalog.active().filter((item) => item.sku.startsWith('PXWASH8'));
    const wired = createCoreFromRepositories({
      catalog: new InMemoryCatalogRepository(items),
      history: new InMemoryOrderHistoryRepository([]),
    });

    const response = wired.matchQuery({ query: 'M8 flat washer DIN 912' });

    expect(response.status).toBe('unique');
    expect(response.results.map((match) => match.sku)).toEqual(['PXWASH816A2BO0624']);
    expect(wired.listCustomers()).toEqual([]);
  });
});
