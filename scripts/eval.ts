import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseEvalJsonl } from '../data/eval/schema';
import { createCore } from '../packages/core/src/application/createCore';
import { runBaseline } from '../packages/core/src/eval/baseline';
import type { EvalSection, JsonSummary } from '../packages/core/src/eval/report';
import { toJson, toMarkdown } from '../packages/core/src/eval/report';
import { run } from '../packages/core/src/eval/run';

// The composition point: the only module here that names a file or wires a core, so the
// harness under packages/core stays pure and receives a Matcher. docs/DESIGN.md 4.2.
const ROOT = new URL('../', import.meta.url);

const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

export interface EvalOptions {
  readonly heldout: boolean;
  readonly baseline: boolean;
  readonly gate: boolean;
  /** Where the floor is read from, relative to the repository root or absolute. CI passes
   * the copy on main, so a regression cannot lower the bar in the commit that causes it. */
  readonly floor: string;
}

export const DEFAULT_FLOOR = 'data/eval/baseline.json';

/** Throws rather than defaulting when the flag arrives without a path: an empty variable
 * in a workflow would otherwise quietly gate the branch against its own floor. */
const floorIn = (argv: readonly string[]): string => {
  const at = argv.indexOf('--floor');
  if (at === -1) return DEFAULT_FLOOR;

  const path = argv[at + 1];
  if (path === undefined || path.startsWith('--')) throw new Error('--floor needs a path');

  return path;
};

/** The held-out set is reported separately and only on request, so an ordinary run
 * cannot quietly tune against it. docs/DESIGN.md 10.1. */
export const parseArgs = (argv: readonly string[]): EvalOptions => ({
  heldout: argv.includes('--heldout'),
  baseline: argv.includes('--baseline'),
  gate: argv.includes('--gate'),
  floor: floorIn(argv),
});

/** The floor CI holds the golden set to, committed in `data/eval/baseline.json`. */
export interface GateFloor {
  readonly recordedOn: string;
  readonly goldenSet: {
    readonly cases: number;
    readonly statusAccuracy: number;
    readonly constraintViolations: number;
  };
}

/** docs/DESIGN.md 10.3. The case count is gated too: dropping the cases a change breaks
 * would raise both other numbers, and is the one way to pass this that must not work. */
export function gateFailures(summary: JsonSummary, floor: GateFloor): string[] {
  const golden = summary.sections.find((section) => section.name === 'Golden set');
  if (golden === undefined) return ['the run produced no golden section to gate on'];

  const failed: string[] = [];
  const { cases, statusAccuracy, constraintViolations } = floor.goldenSet;

  if (golden.cases < cases) {
    failed.push(`the golden set holds ${String(golden.cases)} cases, down from ${String(cases)}`);
  }
  if (golden.status.accuracy < statusAccuracy) {
    failed.push(
      `status accuracy ${golden.status.accuracy.toFixed(4)} is below the committed ${statusAccuracy.toFixed(4)}`,
    );
  }
  if (golden.constraints.violations > constraintViolations) {
    failed.push(
      `${String(golden.constraints.violations)} matches contradict the query, above the committed ${String(constraintViolations)}`,
    );
  }

  return failed;
}

export function evaluate({ heldout, baseline }: Pick<EvalOptions, 'heldout' | 'baseline'>): {
  markdown: string;
  summary: JsonSummary;
} {
  const core = createCore({ dataDir: fileURLToPath(new URL('data', ROOT)) });
  const evaluateSet = (name: string, cases: ReturnType<typeof parseEvalJsonl>): EvalSection => ({
    name,
    report: run({ matcher: { match: core.matchQuery }, catalog: core.catalog, cases }),
  });

  const goldenCases = parseEvalJsonl(read('data/eval/golden.jsonl'));
  const golden: EvalSection = {
    ...evaluateSet('Golden set', goldenCases),
    // The golden set only. The held-out cases are read once, at the end, to report the
    // parser; a control scored against them would spend them for nothing.
    ...(baseline ? { baseline: runBaseline({ catalog: core.catalog, cases: goldenCases }) } : {}),
  };

  const sections = [
    golden,
    ...(heldout
      ? [evaluateSet('Held-out set', parseEvalJsonl(read('data/eval/heldout.jsonl')))]
      : []),
  ];

  return { markdown: toMarkdown(sections), summary: toJson(sections) };
}

function main(argv: readonly string[]): void {
  const options = parseArgs(argv);
  const { markdown, summary } = evaluate(options);

  writeFileSync(new URL('docs/eval-report.md', ROOT), markdown);
  writeFileSync(new URL('data/eval/last-run.json', ROOT), `${JSON.stringify(summary, null, 2)}\n`);

  process.stdout.write(markdown);

  if (options.gate) {
    const floor = JSON.parse(read(options.floor)) as GateFloor;
    const failed = gateFailures(summary, floor);
    if (failed.length > 0) {
      process.stderr.write(
        `\nEval gate failed:\n${failed.map((line) => `  - ${line}`).join('\n')}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `\nEval gate passed against ${options.floor}, recorded ${floor.recordedOn}.\n`,
    );
  }

  const skipped = [
    ...(options.heldout ? [] : ['Held-out set not run. Pass --heldout to include it.']),
    ...(options.baseline
      ? []
      : ['Baseline not run. Pass --baseline to compare against the lexical fallback.']),
  ];
  if (skipped.length > 0) process.stdout.write(`\n${skipped.join('\n')}\n`);
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  main(process.argv.slice(2));
}
