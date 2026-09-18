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
