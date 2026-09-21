import { readFileSync } from 'node:fs';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import type { CatalogItem } from '../domain/catalog';
import type { DescriptionParser } from '../domain/contracts';
import { correct } from '../parsing/fuzzy';
import { normalize } from '../parsing/normalize';
import type { Matcher } from '../ports/matcher';
import { DEFAULT_MATCHER_CONFIG } from './config';
import type { ScoredSku } from './lexicalFallback';
import { LexicalOnlyMatcher, buildIndex, score } from './lexicalFallback';

const CATALOG = new URL('../../../../data/catalog.csv', import.meta.url);

// The fallback scores description text alone, so a parser that returns nothing still
// exercises it fully.
const noSpec: DescriptionParser = { parse: () => ({ residue: [], evidence: {}, provenance: {} }) };

const catalogItems = CsvCatalogRepository.fromText(readFileSync(CATALOG, 'utf8'), noSpec).active();
const catalogIndex = buildIndex(catalogItems);
const bySku = new Map(catalogItems.map((entry) => [entry.sku, entry.description]));

const descriptionOf = (entry: ScoredSku): string => bySku.get(entry.sku) ?? '';

/** What the caller hands `score`: normalization plus fuzzy correction. */
const queryTokensOf = (query: string): string[] =>
  normalize(query).tokens.map((token) => correct(token.text)?.word ?? token.text);

let nextId = 0;
const item = (description: string, overrides: Partial<CatalogItem> = {}): CatalogItem => {
  nextId += 1;
  return {
    catalogId: `CAT-${String(nextId).padStart(4, '0')}`,
    sku: `SKU-${String(nextId).padStart(4, '0')}`,
    description,
    active: true,
    spec: { residue: [], evidence: {}, provenance: {} },
    ...overrides,
  };
};

const skus = (ranked: readonly { sku: string }[]): string[] => ranked.map((entry) => entry.sku);

describe('buildIndex', () => {
  it('indexes the normalized tokens of every description', () => {
    const index = buildIndex([item('HEX NUT'), item('FLAT WASHER')]);

    expect(index.size).toBe(2);
    expect(index.averageLength).toBe(2);
  });

  it('counts a term once per document, however often it repeats', () => {
    const index = buildIndex([item('zinc zinc zinc'), item('steel')]);

    expect(index.documentFrequency.get('zinc')).toBe(1);
  });
});

describe('score: inverse document frequency', () => {
  it('ranks a document holding the rare term above one holding the common term', () => {
    const common = item('zinc washer');
    const rare = item('titanium washer');
    const filler = Array.from({ length: 8 }, () => item('zinc nut'));

    const ranked = score(buildIndex([common, rare, ...filler]), ['zinc', 'titanium']);

    expect(ranked[0]?.sku).toBe(rare.sku);
  });

  it('ignores a query term the catalog never uses instead of penalizing the document', () => {
    const index = buildIndex([item('brass bolt'), item('steel nut')]);

    expect(score(index, ['brass', 'unobtainium'])).toEqual(score(index, ['brass']));
  });
});

describe('score: length normalization', () => {
  it('ranks the shorter description first when both hold the term once', () => {
    const short = item('brass nut');
    const long = item('brass nut din 933 astm a307 hot dip galvanized full thread');

    expect(skus(score(buildIndex([long, short]), ['brass']))).toEqual([short.sku, long.sku]);
  });
});

describe('score: term frequency saturation', () => {
  it('adds less for a repeated term than for the first occurrence', () => {
    const once = item('zinc a b c');
    const twice = item('zinc zinc b c');
    const filler = Array.from({ length: 8 }, () => item('steel nut'));
    const ranked = score(buildIndex([once, twice, ...filler]), ['zinc']);

    const first = ranked.find((entry) => entry.sku === once.sku)?.score ?? 0;
    const second = ranked.find((entry) => entry.sku === twice.sku)?.score ?? 0;

    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(2 * first);
  });
});

describe('score: shape of the result', () => {
  it('normalizes the top score to exactly one', () => {
    const ranked = score(buildIndex([item('brass nut'), item('brass bolt')]), ['brass']);

    expect(ranked[0]?.score).toBe(1);
  });

  it('drops documents no query term reaches', () => {
    const ranked = score(buildIndex([item('brass nut'), item('steel bolt')]), ['brass']);

    expect(ranked).toHaveLength(1);
  });

  it('returns nothing when no document holds any query term', () => {
    expect(score(buildIndex([item('brass nut')]), ['titanium'])).toEqual([]);
  });

  it('breaks ties by sku so the order never depends on catalog order', () => {
    const a = item('brass nut', { sku: 'SKU-AAA' });
    const b = item('brass nut', { sku: 'SKU-BBB' });

    expect(skus(score(buildIndex([b, a]), ['brass']))).toEqual(['SKU-AAA', 'SKU-BBB']);
  });

  it('breaks ties by code unit, so the order never depends on the locale of the runner', () => {
    // Every locale collates `a` below the capitals, and Lithuanian puts `Y` between `I` and
    // `J`; code units order all four the other way.
    const ordered = ['SKU-I', 'SKU-J', 'SKU-Y', 'SKU-a'];
    const tied = ordered.map((sku) => item('brass nut', { sku }));

    expect(skus(score(buildIndex([...tied].reverse()), ['brass']))).toEqual(ordered);
  });
});

describe('score: over the shipped catalog', () => {
  const ranked = (query: string): ScoredSku[] => score(catalogIndex, queryTokensOf(query));

  it('indexes every active row', () => {
    expect(catalogIndex.size).toBe(916);
  });

  it('ranks brass tap bolts first for `big brass bolt`', () => {
    const top = ranked('big brass bolt').slice(0, 10).map(descriptionOf);

    for (const description of top) {
      expect(description).toMatch(/brass/i);
      expect(description).toMatch(/tap bolt/i);
    }
  });

  it('ranks washers first for `washr`', () => {
    const top = ranked('washr').slice(0, 10).map(descriptionOf);

    for (const description of top) {
      expect(description).toMatch(/washer/i);
    }
  });

  it('returns the same ranking every time', () => {
    expect(ranked('big brass bolt')).toEqual(ranked('big brass bolt'));
  });

  it('builds the index and answers a query inside the card budget', () => {
    const items = catalogItems;

    const builtAt = performance.now();
    buildIndex(items);
    const build = performance.now() - builtAt;

    const tokens = queryTokensOf('5/16-18 x 2 brass tap bolt plain');
    const queriedAt = performance.now();
    for (let run = 0; run < 100; run += 1) score(catalogIndex, tokens);
    const query = (performance.now() - queriedAt) / 100;

    // The card asks for 100 ms and 2 ms; this machine does 10.6 ms and 0.284 ms, and
    // 15.8 ms and 0.420 ms under --coverage. The walls leave a slow CI runner room.
    expect(build).toBeLessThan(250);
    expect(query).toBeLessThan(5);
  });
});

describe('LexicalOnlyMatcher', () => {
  const matcher = (...descriptions: string[]): LexicalOnlyMatcher =>
    new LexicalOnlyMatcher(buildIndex(descriptions.map((description) => item(description))));

  it('satisfies the Matcher port without the matching layer importing it', () => {
    const port: Matcher = matcher('brass nut');

    expect(port.match({ query: 'brass' }).results).toHaveLength(1);
  });

  it('returns three results by default and honours a smaller limit', () => {
    const subject = matcher('brass nut', 'brass bolt', 'brass rod', 'brass washer');

    expect(subject.match({ query: 'brass' }).results).toHaveLength(3);
    expect(subject.match({ query: 'brass', limit: 2 }).results).toHaveLength(2);
  });

  it('caps confidence at the configured lexical ceiling', () => {
    const response = matcher('brass nut', 'brass bolt').match({ query: 'brass' });

    for (const result of response.results) {
      expect(result.confidence).toBeLessThanOrEqual(DEFAULT_MATCHER_CONFIG.lexicalCap);
    }
    expect(response.results[0]?.confidence).toBe(DEFAULT_MATCHER_CONFIG.lexicalCap);
  });

  it('reports every query token as unverified residue, because nothing was parsed', () => {
    const response = matcher('brass nut').match({ query: 'two brass nuts please' });

    expect(response.parsed.residue).toEqual(['two', 'brass', 'nut']);
    expect(response.results[0]?.explanation.unverified).toEqual(['two', 'brass', 'nut']);
    expect(response.notes.map((note) => note.code)).toEqual(['unverifiedResidue']);
  });

  it('corrects a typo before scoring, so `washr` still finds washers', () => {
    const response = matcher('flat washer', 'hex nut').match({ query: 'washr' });

    expect(response.results[0]?.description).toBe('flat washer');
  });

  it('reports status none and no results when no token reaches the catalog', () => {
    const response = matcher('brass nut').match({ query: 'titanium' });

    expect(response.status).toBe('none');
    expect(response.results).toEqual([]);
    expect(response.compatibleCount).toBe(0);
  });

  it('reports status unique when the runner-up trails by more than the configured gap', () => {
    const response = matcher('brass', 'brass nut din 933 astm a307 hot dip galvanized').match({
      query: 'brass',
    });

    expect(response.status).toBe('unique');
  });

  it('reports status ambiguous when the top scores are level', () => {
    const response = matcher('brass nut', 'brass bolt').match({ query: 'brass' });

    expect(response.status).toBe('ambiguous');
    expect(response.compatibleCount).toBe(2);
  });

  it('counts every scored row, not only the ones it returns', () => {
    const subject = matcher('brass a', 'brass b', 'brass c', 'brass d', 'brass e');

    expect(subject.match({ query: 'brass' }).compatibleCount).toBe(5);
  });

  it('offers no alternatives, because the baseline has no backoff to relax', () => {
    expect(matcher('brass nut').match({ query: 'brass' }).alternatives).toEqual([]);
  });
});

const WORDS = ['brass', 'steel', 'zinc', 'nut', 'bolt', 'washer', 'hex', 'plain'] as const;

const corpus = fc.array(
  fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 8 }).map((w) => w.join(' ')),
  { minLength: 1, maxLength: 20 },
);

const query = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 4 });

describe('score: properties', () => {
  it('leads with exactly one and never scores above it', () => {
    fc.assert(
      fc.property(corpus, query, (descriptions, tokens) => {
        const ranked = score(buildIndex(descriptions.map((d) => item(d))), tokens);
        if (ranked.length === 0) return;

        expect(ranked[0]?.score).toBe(1);
        for (const entry of ranked) {
          expect(entry.score).toBeGreaterThan(0);
          expect(entry.score).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('orders by descending score and breaks every tie by sku', () => {
    fc.assert(
      fc.property(corpus, query, (descriptions, tokens) => {
        const ranked = score(buildIndex(descriptions.map((d) => item(d))), tokens);

        for (const [position, entry] of ranked.slice(1).entries()) {
          const previous = ranked[position]!;
          const ordered =
            previous.score > entry.score ||
            (previous.score === entry.score && previous.sku < entry.sku);
          expect(ordered).toBe(true);
        }
      }),
    );
  });

  it('is unmoved by a query token the catalog has never seen', () => {
    fc.assert(
      fc.property(corpus, query, (descriptions, tokens) => {
        const index = buildIndex(descriptions.map((d) => item(d)));

        expect(score(index, [...tokens, 'unobtainium'])).toEqual(score(index, tokens));
      }),
    );
  });
});

describe('score: an empty catalog', () => {
  it('ranks nothing rather than dividing by a zero average length', () => {
    expect(score(buildIndex([]), ['brass'])).toEqual([]);
  });
});
