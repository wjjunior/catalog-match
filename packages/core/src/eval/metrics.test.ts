import { describe, expect, it } from 'vitest';

import { catalog, caseOf, outcomeOf } from '../../test/eval/fixtures';
import type { CaseOutcome } from './metrics';
import {
  calibration,
  constraintPreservation,
  latency,
  personalization,
  retrieval,
  setRecovery,
  statusConfusion,
} from './metrics';

describe('retrieval of the intended SKU', () => {
  const outcomes = [
    outcomeOf(caseOf({ id: 'r-1', expected: ['SS'], expectedStatus: 'unique' }), ['SS', 'BO']),
    outcomeOf(caseOf({ id: 'r-2', expectedTop1: 'BO' }), ['SS', 'BO']),
    outcomeOf(caseOf({ id: 'r-3', expected: ['SS', 'BO', 'NUT', 'BR'], expectedTop1: 'BR' }), [
      'SS',
      'BO',
      'NUT',
      'BR',
    ]),
    outcomeOf(caseOf({ id: 'r-4' }), ['SS', 'BO']),
  ];

  it('scores only the cases that name an intended SKU', () => {
    expect(retrieval(outcomes).cases).toBe(3);
  });

  it('counts a hit at rank 1, at rank 3, and the reciprocal of the true rank', () => {
    expect(retrieval(outcomes)).toEqual({
      cases: 3,
      hit1: expect.closeTo(1 / 3, 10),
      hit3: expect.closeTo(2 / 3, 10),
      mrr: expect.closeTo((1 + 1 / 2 + 1 / 4) / 3, 10),
    });
  });

  it('gives a matcher that ranks every intended SKU last exactly the reciprocal ranks', () => {
    const reversed = [
      outcomeOf(caseOf({ id: 'w-1', expected: ['SS'], expectedStatus: 'unique' }), ['BO', 'SS']),
      outcomeOf(caseOf({ id: 'w-2', expectedTop1: 'BO' }), ['SS', 'NUT', 'BR', 'BO']),
    ];

    expect(retrieval(reversed)).toEqual({
      cases: 2,
      hit1: 0,
      hit3: expect.closeTo(1 / 2, 10),
      mrr: expect.closeTo((1 / 2 + 1 / 4) / 2, 10),
    });
  });

  it('counts a hit at exactly rank 3 and stops at rank 4', () => {
    const ranked = (top1: string): CaseOutcome =>
      outcomeOf(
        caseOf({ id: `b-${top1}`, expected: ['SS', 'BO', 'NUT', 'BR'], expectedTop1: top1 }),
        ['SS', 'BO', 'NUT', 'BR'],
      );

    expect(retrieval([ranked('NUT'), ranked('BR')]).hit3).toBeCloseTo(1 / 2, 10);
  });

  it('scores a rank of zero when the intended SKU is not returned at all', () => {
    const missed = [outcomeOf(caseOf({ id: 'm-1', expectedTop1: 'BR' }), ['SS', 'BO'])];

    expect(retrieval(missed)).toEqual({ cases: 1, hit1: 0, hit3: 0, mrr: 0 });
  });
});

describe('recovery of the compatible set', () => {
  it('averages precision and recall per case and counts the exact sets', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 's-1', expected: ['SS', 'BO'] }), ['BO', 'SS']),
      outcomeOf(caseOf({ id: 's-2', expected: ['SS', 'BO', 'BR'] }), ['SS', 'BO']),
      outcomeOf(caseOf({ id: 's-3', expected: ['SS', 'BO'] }), ['SS', 'BO', 'NUT', 'BR']),
    ];

    expect(setRecovery(outcomes)).toEqual({
      cases: 3,
      precision: expect.closeTo((1 + 1 + 1 / 2) / 3, 10),
      recall: expect.closeTo((1 + 2 / 3 + 1) / 3, 10),
      exactSetRate: expect.closeTo(1 / 3, 10),
    });
  });

  it('leaves out a single-label case and a row that labels no set', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'u-1', expected: ['SS'], expectedStatus: 'unique' }), ['SS']),
      outcomeOf(caseOf({ id: 'o-1', expected: [], tags: ['status-only'] }), ['SS', 'BO']),
      outcomeOf(caseOf({ id: 'a-1', expected: ['SS', 'BO'] }), ['SS', 'BO']),
    ];

    expect(setRecovery(outcomes).cases).toBe(1);
  });

  // Returning nothing is a failure to recover the set, not perfect precision over an
  // empty selection.
  it('scores an empty result at zero rather than rewarding it', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'e-1', expected: ['SS', 'BO'] }), [])];

    expect(setRecovery(outcomes)).toEqual({
      cases: 1,
      precision: 0,
      recall: 0,
      exactSetRate: 0,
    });
  });
});

describe('status correctness', () => {
  const outcomes = [
    outcomeOf(caseOf({ id: 'x-1', expectedStatus: 'unique', expected: ['SS'] }), ['SS']),
    outcomeOf(caseOf({ id: 'x-2', expectedStatus: 'unique', expected: ['SS'] }), ['SS', 'BO'], {
      status: 'ambiguous',
    }),
    outcomeOf(caseOf({ id: 'x-3', expectedStatus: 'none', expected: [] }), [], { status: 'none' }),
  ];

  it('counts every case, right or wrong', () => {
    expect(statusConfusion(outcomes).cases).toBe(3);
  });

  it('reports the share on the diagonal', () => {
    expect(statusConfusion(outcomes).accuracy).toBeCloseTo(2 / 3, 10);
  });

  it('puts each case in the cell of expected against actual', () => {
    const { matrix } = statusConfusion(outcomes);

    expect(matrix.unique.unique).toBe(1);
    expect(matrix.unique.ambiguous).toBe(1);
    expect(matrix.none.none).toBe(1);
    expect(matrix.history.unparsed).toBe(0);
  });
});

describe('constraint preservation', () => {
  it('counts a returned match that contradicts an attribute the query stated', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'p-1', query: 'brass hex nut M16', expected: [] }), ['NUT']),
    ];
    const result = constraintPreservation(outcomes, catalog);

    expect(result.violations).toBe(1);
    expect(result.offenders).toEqual([{ id: 'p-1', sku: 'NUT', attribute: 'material' }]);
  });

  it('counts nothing when the query states no value for the attribute that differs', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'p-2' }), ['SS', 'BO', 'BR'])];

    expect(constraintPreservation(outcomes, catalog).violations).toBe(0);
  });

  it('reads a family the query named as satisfied by any member of it', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'p-3', query: 'stainless M8 washer' }), ['SS', 'BO']),
      outcomeOf(caseOf({ id: 'p-4', query: 'stainless M8 washer' }), ['BR']),
    ];
    const result = constraintPreservation(outcomes, catalog);

    expect(result.violations).toBe(1);
    expect(result.offenders).toEqual([{ id: 'p-4', sku: 'BR', attribute: 'material' }]);
  });

  it('catches a diameter the query stated and the item does not carry', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'p-5' }), ['SS', 'NUT'])];
    const result = constraintPreservation(outcomes, catalog);

    expect(result.offenders).toEqual([{ id: 'p-5', sku: 'NUT', attribute: 'diameter' }]);
  });

  it('counts the cases it looked at, not only the ones that failed', () => {
    expect(constraintPreservation([outcomeOf(caseOf(), ['SS'])], catalog).cases).toBe(1);
  });
});

describe('personalization', () => {
  const outcomes = [
    outcomeOf(caseOf({ id: 'z-1', customerId: 'CUST-001', expectedTop1: 'SS' }), ['SS', 'BO'], {
      confidences: [0.8, 0.2],
      without: ['BO', 'SS'],
    }),
    outcomeOf(caseOf({ id: 'z-2', customerId: 'CUST-002', expectedTop1: 'BO' }), ['BO', 'SS'], {
      confidences: [0.5, 0.4],
      without: ['BO', 'SS'],
    }),
    outcomeOf(caseOf({ id: 'z-3', expectedTop1: 'SS' }), ['SS', 'BO']),
  ];

  it('scores only the cases that name a customer', () => {
    expect(personalization(outcomes).cases).toBe(2);
  });

  it('compares Hit@1 with the customer against the same query without one', () => {
    expect(personalization(outcomes)).toEqual({
      cases: 2,
      hit1: 1,
      hit1WithoutCustomer: expect.closeTo(1 / 2, 10),
      margin: expect.closeTo((0.6 + 0.1) / 2, 10),
    });
  });
});

describe('calibration', () => {
  const single = (id: string, confidence: number, top: string): CaseOutcome =>
    outcomeOf(caseOf({ id, expected: ['SS'], expectedStatus: 'unique' }), [top, 'BR'], {
      confidences: [confidence, 0.01],
    });

  it('bins the top-1 confidence and reports the empirical precision of each bin', () => {
    const { bins, cases } = calibration([
      single('k-1', 0.95, 'SS'),
      single('k-2', 0.91, 'BR'),
      single('k-3', 0.05, 'SS'),
    ]);

    expect(cases).toBe(3);
    expect(bins).toHaveLength(10);
    expect(bins[9]).toEqual({ lower: 0.9, upper: 1, count: 2, precision: expect.closeTo(0.5, 10) });
    expect(bins[0]).toEqual({ lower: 0, upper: 0.1, count: 1, precision: 1 });
    expect(bins[5]).toEqual({ lower: 0.5, upper: 0.6, count: 0, precision: undefined });
  });

  it('puts a confidence of exactly 1 in the top bin rather than past the end', () => {
    expect(calibration([single('k-4', 1, 'SS')]).bins[9]?.count).toBe(1);
  });

  // A tie query has acceptable answers and no intended one, and a history reference
  // carries a rank decay rather than a posterior. Neither belongs on this axis.
  it('leaves out every case whose status is not unique', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'k-5', expectedTop1: 'SS' }), ['SS'], { confidences: [0.9] }),
      outcomeOf(
        caseOf({ id: 'k-6', expectedStatus: 'history', expected: ['SS'], expectedTop1: 'SS' }),
        ['SS'],
        { confidences: [0.7] },
      ),
    ];

    expect(calibration(outcomes).cases).toBe(0);
  });
});

describe('latency', () => {
  it('takes the nearest rank rather than interpolating between samples', () => {
    const outcomes = [40, 10, 30, 20].map((latencyMs, rank) =>
      outcomeOf(caseOf({ id: `l-${String(rank)}` }), ['SS'], { latencyMs }),
    );

    expect(latency(outcomes)).toEqual({ cases: 4, p50: 20, p95: 40 });
  });
});

describe('an item that is silent about a stated attribute', () => {
  // A washer carries no pitch because it has no thread, and the golden set lists exactly
  // such a row as a correct answer to a query that states one. Saying nothing about an
  // attribute is not saying something else about it.
  it('is not counted as contradicting it', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'q-1', query: '5/16-18 flat washer' }), ['SILENT'])];

    expect(constraintPreservation(outcomes, catalog).violations).toBe(0);
  });

  it('still counts an item that carries a different value', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'q-2', query: 'M8 flat washer' }), ['NUT'])];

    expect(constraintPreservation(outcomes, catalog).violations).toBe(1);
  });
});
