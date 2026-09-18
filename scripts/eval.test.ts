import { describe, expect, expectTypeOf, it } from 'vitest';

import type { EvalCase as SchemaRow } from '../data/eval/schema';
import type { EvalCase as HarnessCase } from '../packages/core/src/eval/loader';
import { evaluate, parseArgs } from './eval';

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
    expect(parseArgs([])).toEqual({ heldout: false, baseline: false });
    expect(parseArgs(['--heldout'])).toEqual({ heldout: true, baseline: false });
  });

  it('keep the baseline out unless it is asked for', () => {
    expect(parseArgs(['--baseline'])).toEqual({ heldout: false, baseline: true });
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
