import { describe, expect, it } from 'vitest';

import { createCoreFromRepositories } from '../../src/application/createCore';
import { matchQuery } from '../../src/application/matchQuery';
import type { Match, MatchResponse } from '../../src/domain/match';
import { buildIndex } from '../../src/matching/lexicalFallback';
import { EXAMPLE_QUERIES } from '../fixtures/example-queries';
import { core } from './setup';

const ask = (query: string, customerId?: string): MatchResponse =>
  core.matchQuery(customerId === undefined ? { query } : { query, customerId });

const skus = (response: MatchResponse): string[] => response.results.map((match) => match.sku);

const codes = (response: MatchResponse): string[] => response.notes.map((note) => note.code);

/** A handful of catalog rows are written in lower case, so the material is read rather
 * than matched. docs/BRIEF.md 3. */
const allBrass = (response: MatchResponse): boolean =>
  response.results.every((match) => /brass/i.test(match.description));

function top(response: MatchResponse): Match {
  const first = response.results[0];
  if (first === undefined) throw new Error(`no results for ${response.query}`);

  return first;
}

function resultFor(response: MatchResponse, sku: string): Match {
  const found = response.results.find((match) => match.sku === sku);
  if (found === undefined) throw new Error(`${sku} is not among ${skus(response).join(', ')}`);

  return found;
}

/** The washer CUST-002 bought twice, and the one DIN 912 M8 flat washer the catalog has. */
const SS_PLAIN_WASHER = 'PXWASH88088PL0688';
const DIN_912_WASHER = 'PXWASH816A2BO0624';
const RETIRED_M16_NUT = 'PXNUT16888PL0901';
const A2_M16_NUT = 'PXNUT1680A2HG0894';

describe('a profile with a repeat purchase', () => {
  it('puts the washer CUST-002 buys at the top and says why', () => {
    const response = ask('M8 flat washer', 'CUST-002');

    expect(top(response).sku).toBe(SS_PLAIN_WASHER);
    expect(top(response).explanation.personalization?.reason).toBe('bought 2x, last 2026-04-15');
  });

  it('separates it from the runner-up by a clear margin', () => {
    const response = ask('M8 flat washer', 'CUST-002');
    const [first, second] = response.results;

    // Printed, not asserted: this test owns the margin, not the band the confidence
    // lands in. docs/DESIGN.md 5.5.
    console.log(`CUST-002 M8 flat washer: ${first?.sku ?? '-'} ${String(first?.confidence)}`);
    console.log(`                         ${second?.sku ?? '-'} ${String(second?.confidence)}`);

    expect(first?.confidence ?? 0).toBeGreaterThan(2 * (second?.confidence ?? 0));
  });

  it('leaves the base ranking alone when no customer is named', () => {
    expect(top(ask('M8 flat washer')).explanation.personalization).toBeUndefined();
  });
});

describe('a profile whose material the compatible set cannot honour', () => {
  it('ranks CUST-004 by the finish alone and says the material could not be matched', () => {
    const response = ask('M8 flat washer', 'CUST-004');

    expect(top(response).sku).toBe(DIN_912_WASHER);
    expect(top(response).explanation.personalization?.reason).toBe(
      'no alloy in the compatible set; material could not be matched',
    );
  });
});

describe('a sparse and conflicting history', () => {
  it('keeps CUST-005 near the uniform prior, so no item separates from the rest', () => {
    const response = core.matchQuery({ query: 'M8 flat washer', customerId: 'CUST-005', limit: 7 });
    const priors = response.results.map((match) => match.components.prior);
    const [first = 0, second = 0] = priors;

    // docs/DESIGN.md 7.2: the shrinkage, not a defect. The sparse case is tested for
    // near-uniformity rather than for a winner.
    expect(response.compatibleCount).toBe(7);
    expect(first).toBeLessThan(1.5 * second);
    expect(Math.max(...priors)).toBeLessThan(2 * Math.min(...priors));
    // The one earlier purchase does not reach the top, and that is the shrinkage working.
    expect(resultFor(response, SS_PLAIN_WASHER).explanation.personalization?.reason).toBe(
      'bought 1x, last 2025-11-30',
    );
  });
});

describe('a query that contradicts the history', () => {
  it('returns brass only for CUST-004 and records the override', () => {
    const response = ask('brass hex nut 1/2-13', 'CUST-004');

    expect(allBrass(response)).toBe(true);
    expect(top(response).explanation.personalization?.overriddenBy).toContain('material');
    expect(top(response).explanation.personalization?.reason).toBe(
      'history prefers alloy black oxide; overridden by the query',
    );
  });
});

describe('an explicit standard against a repeat purchase', () => {
  it('cannot lift the washer CUST-002 buys into a set it is not in', () => {
    const response = ask('M8 flat washer DIN 912', 'CUST-002');

    expect(response.status).toBe('unique');
    expect(skus(response)).toEqual([DIN_912_WASHER]);
    expect(skus(response)).not.toContain(SS_PLAIN_WASHER);
  });
});

describe('a discontinued purchase', () => {
  it('notes it, excludes it, and credits the stainless nut that stands in for it', () => {
    const response = ask('M16 hex nut', 'CUST-002');

    expect(codes(response)).toContain('discontinued');
    expect(skus(response)).not.toContain(RETIRED_M16_NUT);
    expect(resultFor(response, A2_M16_NUT).explanation.personalization?.reason).toBe(
      `shares diameter, type and material family with ${RETIRED_M16_NUT}`,
    );
  });

  it('says which SKU is gone', () => {
    const note = ask('M16 hex nut', 'CUST-002').notes.find(
      (entry) => entry.code === 'discontinued',
    );

    expect(note?.message).toBe(
      `previously ordered ${RETIRED_M16_NUT} is discontinued; showing closest active`,
    );
  });

  it('stays silent about a discontinued purchase of another diameter', () => {
    expect(codes(ask('M8 flat washer', 'CUST-002'))).not.toContain('discontinued');
  });
});

describe('without a customer', () => {
  const base = matchQuery({
    catalog: core.catalog,
    index: buildIndex(core.catalog.active()),
    config: core.config,
  });

  // Field by field rather than by spreading the rest: a field added to the response
  // then fails to compile here instead of quietly escaping the parity check.
  const comparable = (response: MatchResponse): Omit<MatchResponse, 'timingsMs'> => ({
    query: response.query,
    parsed: response.parsed,
    status: response.status,
    compatibleCount: response.compatibleCount,
    results: response.results,
    alternatives: response.alternatives,
    notes: response.notes,
  });

  it.each(EXAMPLE_QUERIES.map((fixture) => fixture.query))(
    'answers %s exactly as the use case without history does',
    (query) => {
      expect(comparable(ask(query))).toEqual(comparable(base({ query })));
    },
  );
});

describe('a pure history reference', () => {
  const reference = (): MatchResponse =>
    core.matchQuery({ query: 'the same washers as last time', customerId: 'CUST-002', limit: 5 });

  it('answers with the orders it names, most recent first', () => {
    expect(reference().status).toBe('history');
    expect(skus(reference())).toEqual([
      SS_PLAIN_WASHER,
      'PXWASH163088PL0030',
      'PXLOCK8888PL0111',
      'PXWASH38688PL0206',
    ]);
  });

  it('covers flat and lock washers alike, as the word does', () => {
    expect(skus(reference()).filter((sku) => sku.startsWith('PXLOCK'))).toEqual([
      'PXLOCK8888PL0111',
    ]);
  });

  it('decays the confidence by rank from the configured start', () => {
    const confidences = reference().results.map((match) => match.confidence);

    expect(confidences).toEqual(
      [0.7, 0.56, 0.448, 0.3584].map((value) => expect.closeTo(value, 10)),
    );
  });

  it('puts the quantity and the order date in the explanation', () => {
    expect(top(reference()).explanation.personalization?.reason).toBe('ordered 2500 on 2026-04-15');
  });

  it('names the whole history when the query selects nothing', () => {
    const response = core.matchQuery({ query: 'reorder', customerId: 'CUST-002', limit: 5 });

    expect(response.status).toBe('history');
    expect(top(response).sku).toBe(SS_PLAIN_WASHER);
    expect(skus(response)).toContain('PXSOC41688PL0685');
  });
});

describe('a history reference with an override', () => {
  const overridden = (customerId?: string): MatchResponse =>
    core.matchQuery(
      customerId === undefined
        ? { query: 'same washers as last time, but brass' }
        : { query: 'same washers as last time, but brass', customerId },
    );

  it('runs the merged specification through the normal pipeline', () => {
    const response = overridden('CUST-002');

    expect(response.status).toBe('unique');
    expect(skus(response)).toEqual(['PXWASH850BRPL0440']);
  });

  it('says which order it started from and what the query changed', () => {
    const note = overridden('CUST-002').notes.find((entry) => entry.code === 'historyReference');

    expect(note?.message).toBe('based on your 2026-04-15 order, material changed to brass');
  });

  it('answers the attributes and keeps the prompt when no customer is selected', () => {
    const response = overridden();

    expect(response.status).toBe('ambiguous');
    expect(allBrass(response)).toBe(true);
    expect(codes(response)).toContain('customerRequired');
  });
});

describe('a customer the history does not know', () => {
  const UNKNOWN = 'CUST-999';

  const comparable = (response: MatchResponse): Omit<MatchResponse, 'timingsMs'> => ({
    query: response.query,
    parsed: response.parsed,
    status: response.status,
    compatibleCount: response.compatibleCount,
    results: response.results,
    alternatives: response.alternatives,
    notes: response.notes,
  });

  it.each(['M8 flat washer', 'brass hex nut 1/2-13', 'M16 hex nut', 'nylon insert thing'])(
    'answers %s exactly as no customer at all does',
    (query) => {
      expect(comparable(ask(query, UNKNOWN))).toEqual(comparable(ask(query)));
    },
  );

  it('claims no preference it has no history for', () => {
    expect(top(ask('M8 flat washer', UNKNOWN)).explanation.personalization).toBeUndefined();
  });

  it('still asks for a customer when the query references an order', () => {
    expect(codes(ask('the same washers as last time', UNKNOWN))).toContain('customerRequired');
  });

  it('builds no profile for it, so an arbitrary id cannot fill the cache', () => {
    let builds = 0;
    const counted = createCoreFromRepositories({
      catalog: core.catalog,
      history: {
        // buildProfile is the only reader of the whole file; everything else is indexed.
        all: () => {
          builds++;

          return core.history.all();
        },
        byCustomer: (customerId) => core.history.byCustomer(customerId),
        customers: () => core.history.customers(),
        latestOrderDate: () => core.history.latestOrderDate(),
      },
    });

    for (const customerId of [UNKNOWN, 'nobody', '']) {
      counted.matchQuery({ query: 'M8 flat washer', customerId });
    }
    expect(builds).toBe(0);

    counted.matchQuery({ query: 'M8 flat washer', customerId: 'CUST-002' });
    counted.matchQuery({ query: 'M16 hex nut', customerId: 'CUST-002' });
    expect(builds).toBe(1);
  });
});
