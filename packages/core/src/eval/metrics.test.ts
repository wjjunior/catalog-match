import { describe, expect, it } from 'vitest';

import { catalog, caseOf, outcomeOf } from '../../test/eval/fixtures';
import type { Alternative } from '../domain/match';
import type { CaseOutcome } from './metrics';
import {
  alternativeRecovery,
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

describe('recovery of the labeled alternatives', () => {
  const alternativeOf = (sku: string): Alternative => ({
    sku,
    catalogId: sku,
    description: sku,
    active: true,
    closeness: 0.5,
    relaxed: ['length'],
    explanation: {
      matched: [],
      unspecified: [],
      unverified: [],
      compatibleCount: 0,
      disambiguateBy: [],
    },
  });

  const none = (
    id: string,
    expectedAlternatives: string[] | undefined,
    offered: readonly string[],
  ): CaseOutcome => {
    const outcome = outcomeOf(
      caseOf({
        id,
        expectedStatus: 'none',
        expected: [],
        ...(expectedAlternatives === undefined ? {} : { expectedAlternatives }),
      }),
      [],
      { status: 'none' },
    );

    return { ...outcome, full: { ...outcome.full, alternatives: offered.map(alternativeOf) } };
  };

  it('averages recall per case over the cases that carry the label', () => {
    const outcomes = [
      none('n-1', ['SS', 'BO'], ['SS', 'BO']),
      none('n-2', ['SS', 'BO'], ['SS']),
      none('n-3', ['SS'], ['NUT']),
    ];

    expect(alternativeRecovery(outcomes)).toEqual({
      cases: 3,
      recall: expect.closeTo((1 + 1 / 2 + 0) / 3, 10),
    });
  });

  it('keeps its own denominator: a case with no label is not a miss', () => {
    const outcomes = [
      none('n-1', ['SS'], ['SS']),
      none('n-2', undefined, ['BO']),
      none('n-3', [], ['BO']),
    ];

    expect(alternativeRecovery(outcomes)).toEqual({ cases: 1, recall: 1 });
  });

  it('reports no cases rather than a perfect score when nothing is labeled', () => {
    expect(alternativeRecovery([none('n-1', undefined, [])])).toEqual({ cases: 0, recall: 0 });
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
      hit1Cases: 2,
      hit1: 1,
      hit1WithoutCustomer: expect.closeTo(1 / 2, 10),
      margin: expect.closeTo((0.6 + 0.1) / 2, 10),
      marginCases: 2,
    });
  });

  // A personalized case whose label names only acceptable SKUs has no answer that could
  // score: counting it as a miss reports the metric's ceiling as if it were a measurement.
  it('leaves a case with no single intended SKU out of the Hit@1 denominator', () => {
    const unwinnable = outcomeOf(
      caseOf({ id: 'z-4', customerId: 'CUST-003', expected: ['SS', 'BO', 'BR'] }),
      ['SS', 'BO', 'BR'],
      { confidences: [0.7, 0.2, 0.1], without: ['SS', 'BO', 'BR'] },
    );

    expect(personalization([...outcomes, unwinnable])).toMatchObject({
      cases: 3,
      hit1Cases: 2,
      hit1: 1,
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

  // A tie query that names one intended SKU is scored by the same posterior as a unique
  // answer, so excluding it emptied the lower bins by construction rather than by the data.
  it('keeps a tie query that names the SKU it expects first', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'k-5', expectedTop1: 'SS' }), ['SS'], { confidences: [0.9] }),
    ];

    expect(calibration(outcomes).cases).toBe(1);
  });

  it('leaves out a tie query whose label names only acceptable answers', () => {
    const outcomes = [outcomeOf(caseOf({ id: 'k-7' }), ['SS', 'BO'], { confidences: [0.9, 0.1] })];

    expect(calibration(outcomes).cases).toBe(0);
  });

  // A history answer carries a recency decay rather than a posterior, and five of them sit
  // on the same value; binning them against empirical precision would measure nothing.
  it('leaves out an answer scored by recency rather than by the posterior', () => {
    const outcomes = [
      outcomeOf(
        caseOf({ id: 'k-6', expectedStatus: 'history', expected: ['SS'], expectedTop1: 'SS' }),
        ['SS'],
        { confidences: [0.7] },
      ),
      outcomeOf(caseOf({ id: 'k-8', expected: ['SS'], expectedStatus: 'unparsed' }), ['SS'], {
        confidences: [0.4],
      }),
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

describe('the rule two lengths are judged by', () => {
  const statingLength = (outcome: CaseOutcome, mm: number): CaseOutcome => ({
    ...outcome,
    full: {
      ...outcome.full,
      parsed: {
        ...outcome.full.parsed,
        length: { value: mm, unit: 'mm', mm },
        provenance: { ...outcome.full.parsed.provenance, length: 'explicit' },
      },
    },
  });

  const against = (mm: number): number =>
    constraintPreservation(
      [
        statingLength(
          outcomeOf(caseOf({ id: 'len', query: 'M8 socket head cap screw' }), ['SCREW']),
          mm,
        ),
      ],
      catalog,
    ).violations;

  // The catalog resolves lengths to a thousandth of a millimetre, so the harness may not
  // be looser than that: a difference the matcher rejects must not pass here unseen.
  it('counts a difference the catalog can still tell apart', () => {
    expect(against(20.005)).toBe(1);
  });

  it('lets two spellings of the same length through', () => {
    expect(against(20)).toBe(0);
  });
});

describe('an attribute the query stated through a typo', () => {
  // `washr` and `hex nutt` reach the parser as corrected, not explicit, and
  // docs/eval/golden-rationale.md 5 says those rows measure constraint preservation.
  // Reading only the `explicit` enum would leave the metric with nothing to check there.
  it('constrains the answer as an exactly spelled one does', () => {
    const outcomes = [outcomeOf(caseOf({ id: 't-1', query: 'hex nutt' }), ['SS'])];

    expect(constraintPreservation(outcomes, catalog).offenders).toEqual([
      { id: 't-1', sku: 'SS', attribute: 'type' },
    ]);
  });

  // A pitch read off the diameter is the parser's own inference, not a promise the
  // customer made, so it is not something the answer can break.
  it('does not constrain it through an attribute the parser merely inferred', () => {
    const outcomes = [outcomeOf(caseOf({ id: 't-2', query: '12 millimeter hex nut' }), ['NUT'])];

    expect(constraintPreservation(outcomes, catalog).violations).toBe(0);
  });
});

describe('the answer given without a customer', () => {
  // docs/DESIGN.md 10.2 asks for the count on all queries with and without a customer.
  it('is scanned for contradictions too, not only the personalized one', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'w-1', customerId: 'CUST-001' }), ['SS'], { without: ['NUT'] }),
    ];

    expect(constraintPreservation(outcomes, catalog).offenders).toEqual([
      { id: 'w-1', sku: 'NUT', attribute: 'diameter' },
    ]);
  });
});

describe('the margin a personalized answer opens', () => {
  it('reports its own denominator, since a lone result has no second to measure against', () => {
    const outcomes = [
      outcomeOf(caseOf({ id: 'm-1', customerId: 'A', expectedTop1: 'SS' }), ['SS', 'BO'], {
        confidences: [0.8, 0.5],
      }),
      outcomeOf(caseOf({ id: 'm-2', customerId: 'B', expected: ['SS'] }), ['SS']),
    ];

    expect(personalization(outcomes)).toMatchObject({
      cases: 2,
      marginCases: 1,
      margin: expect.closeTo(0.3, 10),
    });
  });
});
