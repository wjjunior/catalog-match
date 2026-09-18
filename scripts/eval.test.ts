import { describe, expect, expectTypeOf, it } from 'vitest';

import type { JsonSummary } from '../packages/core/src/eval/report';
import type { EvalCase as SchemaRow } from '../data/eval/schema';
import type { EvalCase as HarnessCase } from '../packages/core/src/eval/loader';
import type { GateFloor } from './eval';
import { DEFAULT_FLOOR, evaluate, gateFailures, parseArgs } from './eval';

describe('the case type the harness consumes', () => {
  // packages/core declares the shape it needs instead of importing a file outside its
  // own package. This is the one place the two definitions meet, so a field added to
  // either without the other fails `pnpm typecheck` here rather than silently at runtime.
  it('is the row the shared schema validates, in both directions', () => {
    expectTypeOf<SchemaRow>().toEqualTypeOf<HarnessCase>();
  });
});

describe('the flags', () => {
  it('keep the held-out set out unless it is asked for', () => {
    expect(parseArgs([])).toEqual({
      heldout: false,
      baseline: false,
      gate: false,
      floor: DEFAULT_FLOOR,
    });
    expect(parseArgs(['--heldout']).heldout).toBe(true);
  });

  it('keep the baseline out unless it is asked for', () => {
    expect(parseArgs(['--baseline']).baseline).toBe(true);
  });

  it('gate only when asked', () => {
    expect(parseArgs(['--gate']).gate).toBe(true);
  });

  it('read the floor from the path given, so CI can point at the copy on main', () => {
    expect(parseArgs(['--gate', '--floor', '/tmp/floor.json']).floor).toBe('/tmp/floor.json');
  });

  it('refuse a --floor with no path rather than falling back to the branch copy', () => {
    expect(() => parseArgs(['--gate', '--floor'])).toThrow(/needs a path/);
    expect(() => parseArgs(['--gate', '--floor', '--heldout'])).toThrow(/needs a path/);
  });
});

describe('a run over the real data', () => {
  const { summary } = evaluate({ heldout: false, baseline: false });

  it('scores the whole golden set', () => {
    expect(summary.sections).toHaveLength(1);
    expect(summary.sections[0]?.name).toBe('Golden set');
    expect(summary.sections[0]?.cases).toBe(78);
  });

  it('subsets each metric as the design says, not over all 78', () => {
    const section = summary.sections[0];

    expect(section?.retrieval.cases).toBe(48);
    expect(section?.setRecovery.cases).toBe(30);
    expect(section?.status.cases).toBe(78);
    expect(section?.personalization.cases).toBe(21);
    expect(section?.calibration.cases).toBe(29);
  });

  it('adds the held-out section only when asked', () => {
    expect(
      evaluate({ heldout: true, baseline: false }).summary.sections.map((s) => s.name),
    ).toEqual(['Golden set', 'Held-out set']);
  });

  it('writes a report that names both the evidence limits and the circularity', () => {
    const { markdown } = evaluate({ heldout: false, baseline: false });

    expect(markdown).toMatch(/limited evidence/i);
    expect(markdown).toMatch(/circular/i);
  });
});

describe('the baseline over the real data', () => {
  const comparisonIn = (markdown: string): string =>
    markdown.slice(markdown.indexOf('### Baseline comparison'));

  const { markdown, summary } = evaluate({ heldout: false, baseline: true });

  it('compares the two approaches on the golden set', () => {
    expect(markdown).toContain('### Baseline comparison');
    expect(comparisonIn(markdown)).toContain('| metric | parser | baseline | cases |');
  });

  it('scores the baseline on the same cases as the parser', () => {
    const section = summary.sections[0];
    const comparison = comparisonIn(markdown);

    expect(comparison).toMatch(
      new RegExp(`\\| Hit@1 \\|.*\\| ${String(section?.retrieval.cases)} \\|`),
    );
    expect(comparison).toMatch(
      new RegExp(`\\| Set recall \\|.*\\| ${String(section?.setRecovery.cases)} \\|`),
    );
  });

  it('counts the seven cases whose expected status the score gap cannot produce', () => {
    expect(comparisonIn(markdown)).toContain('those two: 7 of 78.');
  });

  it('answers with the same numbers on a second run', () => {
    expect(comparisonIn(evaluate({ heldout: false, baseline: true }).markdown)).toBe(
      comparisonIn(markdown),
    );
  });

  it('keeps the baseline out of the committed summary', () => {
    expect(JSON.stringify(summary)).not.toMatch(/baseline/i);
  });
});

describe('the CI gate', () => {
  const floor: GateFloor = {
    recordedOn: '2026-09-18',
    goldenSet: { cases: 78, statusAccuracy: 0.9615, constraintViolations: 0 },
  };

  const summaryOf = (over: {
    cases?: number;
    accuracy?: number;
    violations?: number;
  }): JsonSummary =>
    ({
      sections: [
        {
          name: 'Golden set',
          cases: over.cases ?? 78,
          status: { accuracy: over.accuracy ?? 0.9615, cases: 78 },
          constraints: { cases: 78, violations: over.violations ?? 0 },
        },
      ],
    }) as unknown as JsonSummary;

  it('passes the run the floor was recorded from', () => {
    expect(gateFailures(summaryOf({}), floor)).toEqual([]);
  });

  it('passes a run that improved on the floor', () => {
    expect(gateFailures(summaryOf({ accuracy: 0.99 }), floor)).toEqual([]);
  });

  it('fails a drop in status accuracy', () => {
    expect(gateFailures(summaryOf({ accuracy: 0.95 }), floor)).toEqual([
      'status accuracy 0.9500 is below the committed 0.9615',
    ]);
  });

  it('fails a match that contradicts the query', () => {
    expect(gateFailures(summaryOf({ violations: 1 }), floor)).toEqual([
      '1 matches contradict the query, above the committed 0',
    ]);
  });

  it('fails a golden set that lost cases, the one way to pass by deleting evidence', () => {
    expect(gateFailures(summaryOf({ cases: 70, accuracy: 1 }), floor)).toEqual([
      'the golden set holds 70 cases, down from 78',
    ]);
  });

  it('fails a run with no golden section at all', () => {
    expect(gateFailures({ sections: [] }, floor)).toEqual([
      'the run produced no golden section to gate on',
    ]);
  });

  it('gates against the committed floor over the real data', () => {
    expect(gateFailures(evaluate({ heldout: false, baseline: false }).summary, floor)).toEqual([]);
  });
});
