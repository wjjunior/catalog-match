import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import type { AttributeName } from '../domain/spec';
import type { MatchStatus } from '../domain/match';
import {
  alternatives,
  compatibleSet,
  deriveStatus,
  failedConstraint,
} from '../matching/compatibility';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { core } from '../../test/integration/setup';
import { descriptionParser } from './descriptionParser';
import { parseQuery } from './queryParser';

const catalogPath = fileURLToPath(new URL('../../../../data/catalog.csv', import.meta.url));
const items = CsvCatalogRepository.load(catalogPath, descriptionParser).active();

interface Answer {
  status: MatchStatus;
  count: number;
  failed: AttributeName | undefined;
  alternativeCount: number;
}

function answer(query: string): Answer {
  const { spec } = parseQuery(query);
  const compatible = compatibleSet(spec, items);

  return {
    status: deriveStatus(spec, compatible),
    count: compatible.length,
    failed: failedConstraint(spec, items),
    alternativeCount: alternatives(spec, items, DEFAULT_MATCHER_CONFIG).length,
  };
}

/** docs/DESIGN.md 6, row "Product not in catalog: diameter or type": note only, no
 * alternatives. The note itself is the use case's to add (PRG-22). */
describe('a type phrase the catalog does not carry', () => {
  it('answers carriage bolt 3/8 with an empty compatible set and nothing else', () => {
    expect(answer('carriage bolt 3/8')).toEqual({
      status: 'none',
      count: 0,
      failed: 'type',
      alternativeCount: 0,
    });
  });

  it.each(['eye bolt 1/2', 'u bolt 3/8', 'shoulder bolt M8', 'wing nut M8', 'acorn nut 1/2'])(
    'answers %s the same way',
    (query) => {
      expect(answer(query)).toEqual({
        status: 'none',
        count: 0,
        failed: 'type',
        alternativeCount: 0,
      });
    },
  );

  it('fails on type, not diameter, so the note can name the phrase', () => {
    expect(answer('carriage bolt 3/8').failed).toBe('type');
    expect(answer('M14 hex nut').failed).toBe('diameter');
  });

  // Neither diameter nor type recognized is what docs/DESIGN.md 5.8 calls unparsed, and
  // the lexical fallback is a better answer than an empty one.
  it('falls back to the lexical path when the phrase is the whole query', () => {
    expect(answer('carriage bolt').status).toBe('unparsed');
  });
});

describe('the rows DESIGN 6 keeps ambiguous', () => {
  it('leaves big brass bolt a large compatible set', () => {
    const { status, count } = answer('big brass bolt');

    expect(status).toBe('ambiguous');
    expect(count).toBeGreaterThan(20);
  });

  it.each(['M8 hex nut nylon insert', 'grade 8 1/2-13 hex nut'])(
    'leaves %s ambiguous on a token the catalog has no place for',
    (query) => {
      expect(answer(query).status).toBe('ambiguous');
    },
  );
});

/** The note was the tell: the catalog does hold M6, so "M6 is not a diameter in this
 * catalog" was never true — it was the textual pitch comparison flipping `known`. */
describe('a pitch spelled with a different number of zeros', () => {
  it.each(['M6-1 x 50mm tap bolt', 'M16-2 x 50mm hex bolt', 'M8-1.250 x 50mm hex bolt'])(
    'leaves %s a satisfiable diameter',
    (query) => {
      const { spec } = parseQuery(query);

      expect(spec.diameter?.known).toBe(true);
      expect(answer(query).status).not.toBe('none');
    },
  );

  it('answers M6-1 x 50mm tap bolt with the SKU the canonical spelling finds', () => {
    expect(core.matchQuery({ query: 'M6-1 x 50mm tap bolt' }).results.map((m) => m.sku)).toEqual([
      'PXTAP65088PL0765',
    ]);
  });

  it('no longer says M6 is not a diameter in this catalog', () => {
    const notes = core.matchQuery({ query: 'M6-1 x 50mm tap bolt' }).notes;

    expect(notes.map((n) => n.message)).not.toContain('M6 is not a diameter in this catalog');
    expect(notes.map((n) => n.code)).not.toContain('unknownDiameter');
  });
});

describe('a quantity phrase standing beside a length', () => {
  it.each(['M8 x 50 qty 100 BHCS', 'M8 x 50 BHCS qty 100'])(
    'answers %s with the 50 mm SKU',
    (query) => {
      expect(answer(query)).toEqual({
        status: 'unique',
        count: 1,
        failed: undefined,
        alternativeCount: 0,
      });
      expect(core.matchQuery({ query }).results.map((m) => m.sku)).toEqual(['PXBTN850ALBO0100']);
    },
  );
});

describe('an unclaimed word between the diameter and a number', () => {
  it.each(['grade 8 1/2-13 hex nut', '1/2-13 hex nut grade 8'])(
    'answers %s over the five 1/2-13 hex nuts',
    (query) => {
      expect(answer(query)).toEqual({
        status: 'ambiguous',
        count: 5,
        failed: undefined,
        alternativeCount: 0,
      });
      expect(core.matchQuery({ query }).notes.map((n) => n.message)).toEqual([
        'not verifiable: grade, 8',
      ]);
    },
  );
});

/** docs/DESIGN.md 6 pairs "standard not in catalog" with "length not in catalog" as a
 * none condition, and makes dropping the standard relaxation step 1. */
describe('a standard the catalog does not stock', () => {
  it('empties the compatible set rather than returning a different standard', () => {
    expect(answer('M8 x 50mm BHCS DIN 125')).toEqual({
      status: 'none',
      count: 0,
      failed: 'standard',
      alternativeCount: 1,
    });
  });

  it('names the standard that failed and offers the ISO item only as an alternative', () => {
    const response = core.matchQuery({ query: 'M8 x 50mm BHCS DIN 125' });

    expect(response.results).toEqual([]);
    expect(response.notes.map((n) => n.message)).toEqual([
      'no M8 button socket cap screw to DIN 125',
    ]);
    expect(response.alternatives.map((a) => [a.sku, a.relaxed])).toEqual([
      ['PXBTN850ALBO0100', ['standard']],
    ]);
  });

  it.each(['M8 flat washer DIN 125', 'DIN 125 M8 flat washer'])(
    'answers %s the same way, with no invented length',
    (query) => {
      expect(answer(query)).toEqual({
        status: 'none',
        count: 0,
        failed: 'standard',
        alternativeCount: 7,
      });

      const response = core.matchQuery({ query });

      expect(response.notes.map((n) => n.message)).toEqual(['no M8 flat washer to DIN 125']);
      expect(response.alternatives.map((a) => a.relaxed)).toEqual([
        ['standard'],
        ['standard'],
        ['standard'],
      ]);
    },
  );
});

const GAP_WORDS = ['length', 'red', 'approx', 'zorbulon'];

const GAP_TEMPLATES = [
  'M8 {gap} x 50mm BHCS',
  'M8 SHCS {gap} 30mm',
  'M16 threaded rod {gap} 60mm',
  '3/8 lag screw {gap} 1 inch',
  'M8 {gap} x 50 BHCS',
];

const fill = (template: string, word: string): string =>
  template.replace('{gap}', word).replace(/\s+/g, ' ').trim();

/** Residue lowers confidence; it never decides which items are compatible
 * (docs/DESIGN.md 5.3), so a word the parser cannot place cannot change the answer. */
describe('a word the catalog has no place for', () => {
  it.each(GAP_TEMPLATES)('leaves the answer to %s as it was', (template) => {
    const base = answer(fill(template, ''));

    for (const word of GAP_WORDS) expect(answer(fill(template, word))).toEqual(base);
  });
});
