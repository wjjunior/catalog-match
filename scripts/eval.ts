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
}

/** The held-out set is reported separately and only on request, so an ordinary run
 * cannot quietly tune against it. docs/DESIGN.md 10.1. */
export const parseArgs = (argv: readonly string[]): EvalOptions => ({
  heldout: argv.includes('--heldout'),
  baseline: argv.includes('--baseline'),
});

export function evaluate({ heldout, baseline }: EvalOptions): {
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
