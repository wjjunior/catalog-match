import type { Match, MatchResponse, PersonalizationExplanation } from '@catalog-match/core';
import { describe, expect, it } from 'vitest';

import { POST } from '../../app/api/match/route';
import { matchResponseSchema } from '../../src/shared/api/schema';

/** The washer CUST-002 buys, the one DIN 912 M8 flat washer, the M16 nut it can no longer
 * buy, and the brass washer the override lands on. */
const SS_PLAIN_WASHER = 'PXWASH88088PL0688';
const DIN_912_WASHER = 'PXWASH816A2BO0624';
const RETIRED_M16_NUT = 'PXNUT16888PL0901';
const OVERRIDDEN_WASHER = 'PXWASH850BRPL0440';

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request('http://localhost/api/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

// The schema runs on every answer: the personalized fields cross the wire as JSON, and it
// is the schema that says they arrived whole rather than as null or as a string.
const match = async (query: string, customerId?: string, limit = 3): Promise<MatchResponse> => {
  const response = await post(
    customerId === undefined ? { query, limit } : { query, customerId, limit },
  );

  expect(response.status).toBe(200);

  const body = (await response.json()) as MatchResponse;

  expect(matchResponseSchema.safeParse(body).error?.issues ?? []).toEqual([]);

  return body;
};

const skus = (response: MatchResponse): string[] => response.results.map((result) => result.sku);

const codes = (response: MatchResponse): string[] => response.notes.map((note) => note.code);

function top(response: MatchResponse): Match {
  const first = response.results[0];
  if (first === undefined) throw new Error(`no results for ${response.query}`);

  return first;
}

function personalizationOf(result: Match): PersonalizationExplanation {
  const found = result.explanation.personalization;
  if (found === undefined) throw new Error(`${result.sku} came back with no personalization`);

  return found;
}

const margin = (response: MatchResponse): number => {
  const [first, second] = response.results;

  return (first?.confidence ?? 0) / (second?.confidence ?? Number.POSITIVE_INFINITY);
};

/** Field by field rather than by spreading the rest: a field added to the response then
 * fails to compile here instead of quietly escaping the parity check. */
const comparable = (response: MatchResponse): Omit<MatchResponse, 'timingsMs'> => ({
  query: response.query,
  parsed: response.parsed,
  status: response.status,
  compatibleCount: response.compatibleCount,
  results: response.results,
  alternatives: response.alternatives,
  notes: response.notes,
});

/** Printed, not asserted: these tests own the ordering and the margin, not the band a
 * confidence lands in. docs/DESIGN.md 5.5. */
function report(label: string, response: MatchResponse): void {
  const [first, second] = response.results;
  const show = (result?: Match): string =>
    result === undefined ? '-' : `${result.sku} ${result.confidence.toFixed(4)}`;

  console.log(`${label.padEnd(30)} top-1 ${show(first).padEnd(26)} top-2 ${show(second)}`);
}

describe('a customer the history has never seen', () => {
  it('answers exactly as no customer at all does', async () => {
    const anonymous = await match('M8 flat washer');
    const unknown = await match('M8 flat washer', 'CUST-999');

    expect(comparable(unknown)).toEqual(comparable(anonymous));
  });

  it('claims no preference on the wire', async () => {
    const response = await match('M8 flat washer');

    expect(
      response.results.filter((result) => result.explanation.personalization !== undefined),
    ).toEqual([]);
  });
});

describe('a profile with a repeat purchase', () => {
  it('re-ranks M8 flat washer for CUST-002 and carries the reason across the wire', async () => {
    const anonymous = await match('M8 flat washer');
    const personalized = await match('M8 flat washer', 'CUST-002');

    report('CUST-002 M8 flat washer', personalized);

    expect(top(personalized).sku).not.toBe(top(anonymous).sku);
    expect(personalizationOf(top(personalized)).reason.length).toBeGreaterThan(0);
    expect(personalizationOf(top(personalized)).prior).toBeGreaterThan(0.5);
    expect(margin(personalized)).toBeGreaterThan(2);
  });

  it('leaves the compatible set where it was', async () => {
    const anonymous = await match('M8 flat washer');
    const personalized = await match('M8 flat washer', 'CUST-002');

    expect(personalized.compatibleCount).toBe(anonymous.compatibleCount);
  });
});

describe('a profile whose material the compatible set cannot honour', () => {
  it('ranks CUST-004 by the finish alone, on a narrower margin than a full profile', async () => {
    const full = await match('M8 flat washer', 'CUST-002');
    const partial = await match('M8 flat washer', 'CUST-004');

    report('CUST-004 M8 flat washer', partial);

    expect(top(partial).sku).not.toBe(top(full).sku);
    expect(margin(partial)).toBeGreaterThan(2);
    expect(margin(partial)).toBeLessThan(margin(full));
  });
});

describe('a sparse and conflicting history', () => {
  it('keeps CUST-005 near the uniform prior, so nothing separates from the rest', async () => {
    const response = await match('M8 flat washer', 'CUST-005', 7);
    const priors = response.results.map((result) => result.components.prior);

    report('CUST-005 M8 flat washer', response);

    // docs/DESIGN.md 7.2: the shrinkage working, not a defect, so the sparse case is tested
    // for near-uniformity rather than for a winner.
    expect(response.results).toHaveLength(7);
    expect(Math.max(...priors)).toBeLessThan(2 * Math.min(...priors));
  });
});

describe('a query that contradicts the history', () => {
  it('returns brass only for CUST-004 and records the override in the payload', async () => {
    const response = await match('brass hex nut 1/2-13', 'CUST-004');

    report('CUST-004 brass hex nut', response);

    // A handful of catalog rows are written in lower case. docs/BRIEF.md 3.
    expect(response.results.filter((result) => !/brass/i.test(result.description))).toEqual([]);
    expect(personalizationOf(top(response)).overriddenBy).toContain('material');
  });
});

describe('an explicit standard against a repeat purchase', () => {
  it('answers the DIN 912 washer alone, whatever CUST-002 keeps buying', async () => {
    const response = await match('M8 flat washer DIN 912', 'CUST-002');

    expect(response.status).toBe('unique');
    expect(skus(response)).toEqual([DIN_912_WASHER]);
    expect(skus(response)).not.toContain(SS_PLAIN_WASHER);
  });
});

describe('a discontinued purchase', () => {
  it('notes it on the wire and answers with active items only', async () => {
    const response = await match('M16 hex nut', 'CUST-002');

    report('CUST-002 M16 hex nut', response);

    expect(codes(response)).toContain('discontinued');
    expect(skus(response)).not.toContain(RETIRED_M16_NUT);
    expect(response.results.filter((result) => !result.active)).toEqual([]);
  });
});

describe('a history reference', () => {
  it('asks for a customer, and names the orders once it has one', async () => {
    const anonymous = await match('the same washers as last time');
    const resolved = await match('the same washers as last time', 'CUST-002', 5);

    expect({
      status: anonymous.status,
      results: anonymous.results.length,
      prompted: codes(anonymous).includes('customerRequired'),
    }).toEqual({ status: 'history', results: 0, prompted: true });

    const confidences = resolved.results.map((result) => result.confidence);
    const byRecency = confidences.every(
      (value, index) => index === 0 || value < (confidences[index - 1] ?? 0),
    );

    expect({ status: resolved.status, confidences, byRecency }).toEqual({
      status: 'history',
      confidences,
      byRecency: true,
    });
    expect(confidences.length).toBeGreaterThan(1);
  });
});

describe('a history reference with an override', () => {
  it('runs the merged specification through the route for CUST-002', async () => {
    const response = await match('same washers as last time, but brass', 'CUST-002');

    expect(response.status).toBe('unique');
    expect(skus(response)).toEqual([OVERRIDDEN_WASHER]);
    expect(codes(response)).toContain('historyReference');
  });

  it('answers the attributes and keeps the prompt when no customer is selected', async () => {
    const response = await match('same washers as last time, but brass');

    expect(response.results.filter((result) => !/brass/i.test(result.description))).toEqual([]);
    expect(codes(response)).toContain('customerRequired');
  });
});
