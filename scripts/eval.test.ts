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

describe('the held-out set', () => {
  it('stays out unless the flag asks for it', () => {
    expect(parseArgs([])).toEqual({ heldout: false });
    expect(parseArgs(['--heldout'])).toEqual({ heldout: true });
  });
});

describe('a run over the real data', () => {
  const { summary } = evaluate({ heldout: false });

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
    expect(evaluate({ heldout: true }).summary.sections.map((s) => s.name)).toEqual([
      'Golden set',
      'Held-out set',
    ]);
  });

  it('writes a report that names both the evidence limits and the circularity', () => {
    const { markdown } = evaluate({ heldout: false });

    expect(markdown).toMatch(/limited evidence/i);
    expect(markdown).toMatch(/circular/i);
  });
});
