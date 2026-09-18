import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { Finish, FinishFamily, Material, MaterialFamily } from '../../src/domain/attributes';
import { FINISH_FAMILY, MATERIAL_FAMILY } from '../../src/domain/attributes';
import type { CatalogItem } from '../../src/domain/catalog';
import type { MatchResponse } from '../../src/domain/match';
import type { AttributeName, ParsedSpec } from '../../src/domain/spec';
import { correct } from '../../src/parsing/fuzzy';
import { LEXICON } from '../../src/parsing/lexicon';
import { normalize } from '../../src/parsing/normalize';
import { core } from '../integration/setup';
import {
  customers,
  exactQueries,
  FINISH_TERMS,
  MATERIAL_TERMS,
  NOISE,
  queries,
  spellingPairs,
  STANDARD_TERMS,
  TYPE_TERMS,
  TYPOS,
  type Spellings,
} from './generators';

const NUM_RUNS = 500;

/** Above the largest compatible set the catalog can produce, so `results` is the whole of
 * C and a sum over it is a sum over the distribution. */
const LIMIT = 1000;

const items = core.catalog.active();
const customerIds = core.history.customers().map((customer) => customer.customerId);
const requests = fc.tuple(queries(items), customers(customerIds));

const materialFamilyOf = (value: Material | MaterialFamily): MaterialFamily | undefined =>
  (MATERIAL_FAMILY as Readonly<Record<string, MaterialFamily | undefined>>)[value];

const finishFamilyOf = (value: Finish | FinishFamily): FinishFamily | undefined =>
  (FINISH_FAMILY as Readonly<Record<string, FinishFamily | undefined>>)[value];

/** Catalog lengths are millimetres apart, and two conversions of one length differ in the
 * fourth decimal at worst, so this separates them without borrowing either of the rules
 * the pipeline uses: a property that asks the filter whether the filter was right proves
 * nothing. */
const SAME_LENGTH_MM = 1e-3;

/** The first attribute of the query that the item cannot satisfy, at family level or
 * better. docs/DESIGN.md 5.3. */
function contradiction(query: ParsedSpec, item: CatalogItem): AttributeName | undefined {
  const held = item.spec;

  if (query.diameter !== undefined) {
    const diameter = held.diameter;
    if (diameter === undefined) return 'diameter';
    if (diameter.nominal !== query.diameter.nominal) return 'diameter';
    if (diameter.system !== query.diameter.system) return 'diameter';
  }

  if (query.length !== undefined) {
    const length = held.length;
    if (length === undefined) return 'length';
    if (Math.abs(length.mm - query.length.mm) > SAME_LENGTH_MM) return 'length';
  }

  if (query.type !== undefined && query.type.length > 0) {
    const readings = query.type.map((reading) => reading.value);
    if (held.type?.some((held) => readings.includes(held.value)) !== true) return 'type';
  }

  if (query.material !== undefined) {
    const value = held.material?.value;
    if (value === undefined) return 'material';
    if (value !== query.material.value && materialFamilyOf(value) !== query.material.value) {
      return 'material';
    }
  }

  if (query.finish !== undefined) {
    const value = held.finish?.value;
    if (value === undefined) return 'finish';
    if (value !== query.finish.value && finishFamilyOf(value) !== query.finish.value) {
      return 'finish';
    }
  }

  if (query.standard !== undefined && held.standard !== query.standard) return 'standard';

  return undefined;
}

/** The mass the null hypothesis holds, rebuilt from what the response exposes: the
 * s_i and q_i of every match and the residue. docs/DESIGN.md 5.5. */
function nullShare(response: MatchResponse): number {
  const { epsilon, kappa } = core.config;
  const evidence = response.results.reduce(
    (sum, match) => sum + match.components.compatibility * match.components.prior,
    0,
  );
  const nullMass = epsilon * kappa ** response.parsed.residue.length;

  return nullMass / ((1 - epsilon) * evidence + nullMass);
}

const skus = (response: MatchResponse): string =>
  response.results
    .map((match) => match.sku)
    .sort()
    .join(' ');

/** Everything a second call must reproduce. Written out rather than deleted from the
 * response, so a field added to `MatchResponse` is left untested loudly. */
const repeatable = (response: MatchResponse): Omit<MatchResponse, 'timingsMs'> => ({
  query: response.query,
  parsed: response.parsed,
  status: response.status,
  compatibleCount: response.compatibleCount,
  results: response.results,
  alternatives: response.alternatives,
  notes: response.notes,
});

const ask = (query: string, customerId?: string): MatchResponse =>
  core.matchQuery({ query, limit: LIMIT, customerId });

describe('the generated-query tables', () => {
  const tables: [string, Record<string, Spellings>][] = [
    ['type', TYPE_TERMS],
    ['material', MATERIAL_TERMS],
    ['finish', FINISH_TERMS],
    ['standard', STANDARD_TERMS],
  ];

  it.each(tables)('spells one %s value per entry, at full strength', (attribute, table) => {
    for (const [value, spellings] of Object.entries(table)) {
      for (const term of [spellings.canonical, ...spellings.variants]) {
        const entry = LEXICON.get(term);
        const only = entry?.values.length === 1 ? entry.values[0] : undefined;

        expect({ term, reading: only, attribute: entry?.attribute }).toEqual({
          term,
          reading: { value, strength: 1 },
          attribute,
        });
      }
    }
  });

  it('pins typos that correct back to the word they misspell', () => {
    for (const { word, typo } of TYPOS) {
      expect({ typo, corrected: correct(typo)?.word }).toEqual({ typo, corrected: word });
    }
  });

  it('keeps noise out of the lexicon and out of reach of the corrector', () => {
    for (const token of NOISE) {
      expect({ token, known: LEXICON.has(token), correction: correct(token) }).toEqual({
        token,
        known: false,
        correction: null,
      });
    }
  });

  // Ends in a bare number, which is where a query the generator writes can end: the 933 of
  // a standard, or a length with no unit after it.
  const NEIGHBOURS = 'm12 x 30 flat washer din 933';

  it('keeps noise from binding the words it sits next to', () => {
    const body = normalize(NEIGHBOURS).tokens.map((token) => token.text);

    for (const token of NOISE) {
      const around = normalize(`${token} ${NEIGHBOURS} ${token}`).tokens.map((each) => each.text);

      expect({ token, kept: around.filter((each) => each !== token) }).toEqual({
        token,
        kept: body,
      });
    }
  });
});

describe('the structural guarantees: properties (docs/DESIGN.md 5.3, 5.5, 7.3, 10.2)', () => {
  it('never returns a match that contradicts a stated attribute', () => {
    fc.assert(
      fc.property(requests, ([generated, customerId]) => {
        const response = ask(generated.query, customerId);
        // The lexical fallback ranks by token overlap over a query that named neither a
        // diameter nor a type, so there is no compatible set for it to preserve.
        if (response.status !== 'unique' && response.status !== 'ambiguous') return;

        for (const match of response.results) {
          const item = core.catalog.bySku(match.sku);
          expect({ sku: match.sku, item: item !== undefined }).toEqual({
            sku: match.sku,
            item: true,
          });
          const failed = item === undefined ? 'missing' : contradiction(response.parsed, item);

          expect({ query: generated.query, sku: match.sku, contradicts: failed }).toEqual({
            query: generated.query,
            sku: match.sku,
            contradicts: undefined,
          });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('derives the status from the size of the compatible set', () => {
    fc.assert(
      fc.property(requests, ([generated, customerId]) => {
        const { status, compatibleCount } = ask(generated.query, customerId);

        // No table entry carries an intent phrase, so nothing generated reaches 7.4.
        expect(status).not.toBe('history');

        const expected =
          status === 'unparsed'
            ? compatibleCount === 0
            : status === 'unique'
              ? compatibleCount === 1
              : status === 'ambiguous'
                ? compatibleCount > 1
                : compatibleCount === 0;

        expect({ query: generated.query, status, compatibleCount, consistent: expected }).toEqual({
          query: generated.query,
          status,
          compatibleCount,
          consistent: true,
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('leaves the mass over the compatible set and the null hypothesis summing to 1', () => {
    fc.assert(
      fc.property(requests, ([generated, customerId]) => {
        const response = ask(generated.query, customerId);
        // `unparsed` confidences are capped token overlap, not a posterior. 5.8.
        if (response.status === 'unparsed') return;

        const total =
          response.results.reduce((sum, match) => sum + match.confidence, 0) + nullShare(response);

        expect(Math.abs(total - 1)).toBeLessThan(1e-9);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('never lets a customer change the compatible set', () => {
    fc.assert(
      fc.property(queries(items), (generated) => {
        const base = ask(generated.query);
        const expected = { count: base.compatibleCount, skus: skus(base) };

        for (const customerId of [...customerIds, 'CUST-999']) {
          const personalized = ask(generated.query, customerId);

          expect({
            customerId,
            count: personalized.compatibleCount,
            skus: skus(personalized),
          }).toEqual({ customerId, ...expected });
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answers an abbreviated request exactly as it answers the written-out one', () => {
    fc.assert(
      fc.property(spellingPairs(items), ({ canonical, variant }) => {
        const written = ask(canonical);
        const short = ask(variant);

        expect({
          query: variant,
          status: short.status,
          compatibleCount: short.compatibleCount,
          ranked: short.results.map((match) => match.sku),
          confidences: short.results.map((match) => match.confidence),
        }).toEqual({
          query: variant,
          status: written.status,
          compatibleCount: written.compatibleCount,
          ranked: written.results.map((match) => match.sku),
          confidences: written.results.map((match) => match.confidence),
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('answers the same request the same way twice', () => {
    fc.assert(
      fc.property(requests, ([generated, customerId]) => {
        const first = ask(generated.query, customerId);
        const second = ask(generated.query, customerId);

        expect(repeatable(second)).toEqual(repeatable(first));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('keeps the item a query was built from inside the compatible set', () => {
    fc.assert(
      fc.property(fc.tuple(exactQueries(items), customers(customerIds)), ([generated, id]) => {
        const response = ask(generated.query, id);

        expect({
          query: generated.query,
          stated: generated.stated,
          status: response.status,
          holds: response.results.some((match) => match.sku === generated.item.sku),
        }).toEqual({
          query: generated.query,
          stated: generated.stated,
          status: response.status === 'unique' ? 'unique' : 'ambiguous',
          holds: true,
        });
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
