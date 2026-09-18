import { describe, expect, it } from 'vitest';

import { catalog, caseOf, responseOf, stubMatcher } from '../../test/eval/fixtures';
import type { MatchRequest } from '../domain/match';
import type { Matcher } from '../ports/matcher';
import { EvalDataError } from './loader';
import { run } from './run';

const ANSWERS = {
  'M8 flat washer': { skus: ['SS', 'BO', 'BR'], confidences: [0.5, 0.3, 0.2] },
  'brass hex nut M16': { skus: ['NUT'], status: 'unique' as const },
};

const ticking = (): (() => number) => {
  let now = 0;
  return () => (now += 5);
};

describe('a run over a stub matcher', () => {
  const cases = [
    caseOf({ id: 'a-1', expected: ['SS', 'BO', 'BR'] }),
    caseOf({
      id: 'a-2',
      query: 'brass hex nut M16',
      expectedStatus: 'unique',
      expected: ['NUT'],
    }),
  ];

  const report = run({ matcher: stubMatcher(ANSWERS).matcher, catalog, cases, clock: ticking() });

  it('reports how many cases it saw', () => {
    expect(report.cases).toBe(2);
  });

  it('scores each metric on its own subset rather than on all of them', () => {
    expect(report.retrieval.cases).toBe(1);
    expect(report.setRecovery.cases).toBe(1);
    expect(report.status.cases).toBe(2);
    expect(report.constraints.cases).toBe(2);
    expect(report.calibration.cases).toBe(1);
    expect(report.personalization.cases).toBe(0);
    expect(report.latency.cases).toBe(2);
  });

  it('gets the set right when the matcher returns exactly the labeled set', () => {
    expect(report.setRecovery).toEqual({
      cases: 1,
      precision: 1,
      recall: 1,
      exactSetRate: 1,
    });
  });

  it('measures latency from the clock it was given, so the numbers are reproducible', () => {
    expect(report.latency).toEqual({ cases: 2, p50: 5, p95: 5 });
  });
});

describe('the requests a run makes', () => {
  it('asks once at the served limit and once at a limit that covers the whole set', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);
    run({ matcher, catalog, cases: [caseOf({ id: 'b-1' })], clock: ticking() });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.limit).toBe(3);
    expect(seen[1]?.limit).toBeGreaterThanOrEqual(catalog.active().length);
  });

  it('asks a third time without the customer, and only where a case names one', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);
    run({
      matcher,
      catalog,
      cases: [caseOf({ id: 'b-2', customerId: 'CUST-001' }), caseOf({ id: 'b-3' })],
      clock: ticking(),
    });

    const withoutCustomer = seen.filter((request) => request.customerId === undefined);

    expect(seen).toHaveLength(5);
    expect(withoutCustomer).toHaveLength(3);
  });

  it('carries the customer on the two requests that measure the personalized answer', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);
    run({
      matcher,
      catalog,
      cases: [caseOf({ id: 'b-4', customerId: 'CUST-002' })],
      clock: ticking(),
    });

    expect(seen.filter((request) => request.customerId === 'CUST-002')).toHaveLength(2);
  });
});

describe('a matcher whose answer depends on the limit', () => {
  // The raised limit exists to see the whole ranking, not to change it. A status that
  // moves with the limit means the two calls measured two different things.
  it('is rejected rather than averaged into the report', () => {
    const shifty: Matcher = {
      match: (request: MatchRequest) =>
        responseOf(request.query, ['SS'], (request.limit ?? 3) > 3 ? 'unique' : 'ambiguous'),
    };

    expect(() => run({ matcher: shifty, catalog, cases: [caseOf({ id: 'c-9' })] })).toThrow(
      /c-9.*status/,
    );
  });
});

describe('a case the catalog cannot account for', () => {
  it('fails before any matcher call, naming the case and the SKU', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);

    expect(() =>
      run({ matcher, catalog, cases: [caseOf({ id: 'd-1', expected: ['NOPE'] })] }),
    ).toThrow(EvalDataError);
    expect(seen).toHaveLength(0);
  });
});

describe('a matcher that ranks the intended SKU last', () => {
  it('is scored down, not rescued by the harness', () => {
    const { matcher } = stubMatcher({
      'M8 flat washer': { skus: ['BR', 'BO', 'SS'], confidences: [0.5, 0.3, 0.2] },
    });
    const report = run({
      matcher,
      catalog,
      cases: [caseOf({ id: 'e-1', expected: ['SS'], expectedStatus: 'unique' })],
      clock: ticking(),
    });

    expect(report.retrieval).toEqual({
      cases: 1,
      hit1: 0,
      hit3: 1,
      mrr: expect.closeTo(1 / 3, 10),
    });
    expect(report.status.accuracy).toBe(0);
  });
});

describe('a matcher that reorders when the limit grows', () => {
  // The served answer must be the first page of the raised-limit one. Otherwise the report
  // takes status from one ranking and MRR, the set and the constraints from another.
  it('is rejected, since status and compatibleCount alone would not notice', () => {
    const reordering: Matcher = {
      match: (request: MatchRequest) =>
        responseOf(
          request.query,
          (request.limit ?? 3) > 3 ? ['BO', 'SS', 'BR'] : ['SS', 'BO', 'BR'],
          'ambiguous',
        ),
    };

    expect(() => run({ matcher: reordering, catalog, cases: [caseOf({ id: 'r-9' })] })).toThrow(
      /r-9.*rank 1/,
    );
  });

  it('accepts the served answer when it is the prefix of the wider one', () => {
    const paging: Matcher = {
      match: (request: MatchRequest) => {
        const full = responseOf(request.query, ['SS', 'BO', 'BR', 'NUT'], 'ambiguous');

        return { ...full, results: full.results.slice(0, request.limit ?? 3) };
      },
    };

    expect(() => run({ matcher: paging, catalog, cases: [caseOf({ id: 'r-8' })] })).not.toThrow();
  });
});

describe('the limit the harness raises to', () => {
  // A history answer is drawn from the customer's orders through bySku, not from the
  // compatible set, so a bound taken from the active catalog alone is the wrong reason
  // even where the number happens to hold.
  it('covers the whole catalog, inactive rows included', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);
    run({ matcher, catalog, cases: [caseOf({ id: 'r-7' })], clock: ticking() });

    expect(seen[1]?.limit).toBeGreaterThanOrEqual(catalog.all().length);
  });
});
