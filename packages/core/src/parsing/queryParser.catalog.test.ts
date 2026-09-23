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
