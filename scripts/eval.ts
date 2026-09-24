import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseEvalJsonl } from '../data/eval/schema';
import { createCore } from '../packages/core/src/application/createCore';
import { runBaseline } from '../packages/core/src/eval/baseline';
import type { EvalSection, JsonSummary } from '../packages/core/src/eval/report';
import { toJson, toMarkdown } from '../packages/core/src/eval/report';
import { run } from '../packages/core/src/eval/run';

const ROOT = new URL('../', import.meta.url);

const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

export interface EvalOptions {
  readonly heldout: boolean;
  readonly gate: boolean;
  readonly floor: string;
}

export const DEFAULT_FLOOR = 'data/eval/baseline.json';

const floorIn = (argv: readonly string[]): string => {
  const at = argv.indexOf('--floor');
  if (at === -1) return DEFAULT_FLOOR;

  const path = argv[at + 1];
  if (path === undefined || path.startsWith('--')) throw new Error('--floor needs a path');

  return path;
};

export const parseArgs = (argv: readonly string[]): EvalOptions => ({
  heldout: argv.includes('--heldout'),
  gate: argv.includes('--gate'),
  floor: floorIn(argv),
});

export interface GateFloor {
  readonly recordedOn: string;
  readonly goldenSet: {
    readonly cases: number;
    readonly statusAccuracy: number;
    readonly constraintViolations: number;
  };
}

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

export const HELD_OUT_TITLE = '# Held-out evaluation';

export function evaluate({ heldout }: Pick<EvalOptions, 'heldout'>): {
  markdown: string;
  heldout?: string;
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
    baseline: runBaseline({ catalog: core.catalog, cases: goldenCases }),
  };

  const frozen = heldout
    ? evaluateSet('Held-out set', parseEvalJsonl(read('data/eval/heldout.jsonl')))
    : undefined;

  return {
    markdown: toMarkdown([golden]),
    ...(frozen === undefined ? {} : { heldout: toMarkdown([frozen], HELD_OUT_TITLE) }),
    summary: toJson(frozen === undefined ? [golden] : [golden, frozen]),
  };
}

function main(argv: readonly string[]): void {
  const options = parseArgs(argv);
  const { markdown, heldout, summary } = evaluate(options);

  writeFileSync(new URL('docs/eval-report.md', ROOT), markdown);
  if (heldout !== undefined) writeFileSync(new URL('docs/eval-heldout.md', ROOT), heldout);
  writeFileSync(new URL('data/eval/last-run.json', ROOT), `${JSON.stringify(summary, null, 2)}\n`);

  process.stdout.write(heldout === undefined ? markdown : `${markdown}\n${heldout}`);

  if (options.gate) {
    const floor = JSON.parse(read(options.floor)) as GateFloor;
    const failed = gateFailures(summary, floor);
    if (failed.length > 0) {
      const lines = failed.map((line) => `  - ${line}`).join('\n');
      process.stderr.write(`\nEval gate failed:\n${lines}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `\nEval gate passed against ${options.floor}, recorded ${floor.recordedOn}.\n`,
    );
  }

  process.stdout.write(
    options.heldout
      ? '\nHeld-out set written to docs/eval-heldout.md. It may be spent only once.\n'
      : '\nHeld-out set not run. It is reported in docs/eval-heldout.md, from its single run.\n',
  );
}

const invoked = process.argv[1];
if (invoked !== undefined && import.meta.url === pathToFileURL(invoked).href) {
  main(process.argv.slice(2));
}
