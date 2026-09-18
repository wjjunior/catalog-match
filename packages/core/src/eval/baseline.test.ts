import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { catalog, caseOf, stubMatcher } from '../../test/eval/fixtures';
import { buildIndex, LexicalOnlyMatcher } from '../matching/lexicalFallback';
import { runBaseline } from './baseline';
import { run } from './run';

const ANSWERS = {
  'M8 flat washer': { skus: ['SS', 'BO', 'BR', 'NUT', 'SILENT', 'SCREW'] },
};

const cases = [caseOf({ id: 'a-1', expected: ['SS', 'BO'] })];

describe('the budget each case is scored on', () => {
  it('asks for the served window, the whole catalog, and then the size of the label', () => {
    const { matcher, seen } = stubMatcher(ANSWERS);

    runBaseline({ catalog, cases, matcher });

    expect(seen.map((request) => request.limit)).toEqual([3, 7, 2]);
  });

  it('recovers the set at that budget where the raised limit buries it', () => {
    const { matcher } = stubMatcher(ANSWERS);

    expect(runBaseline({ catalog, cases, matcher }).setRecovery).toEqual({
      cases: 1,
      precision: 1,
      recall: 1,
      exactSetRate: 1,
    });
  });

  it('is the only thing the budget changes: the same answer scores 2 of 6 unbudgeted', () => {
    const { matcher } = stubMatcher(ANSWERS);

    expect(run({ matcher, catalog, cases }).setRecovery.precision).toBeCloseTo(2 / 6);
  });

  it('leaves a case with no labeled set to the metric, which does not score it', () => {
    const { matcher } = stubMatcher(ANSWERS);
    const unlabeled = [caseOf({ id: 'a-2', expectedStatus: 'none', expected: [] })];

    expect(runBaseline({ catalog, cases: unlabeled, matcher }).setRecovery.cases).toBe(0);
  });
});

describe('what the comparison carries', () => {
  const { matcher } = stubMatcher(ANSWERS);
  const comparison = runBaseline({ catalog, cases, matcher });

  it('reports the three metrics the baseline can be held to and no others', () => {
    expect(Object.keys(comparison).sort()).toEqual(['retrieval', 'setRecovery', 'status']);
  });

  it('passes retrieval and status through the same run the parser is scored by', () => {
    const { matcher: same } = stubMatcher(ANSWERS);
    const parserSideRun = run({ matcher: same, catalog, cases });

    expect(comparison.retrieval).toEqual(parserSideRun.retrieval);
    expect(comparison.status).toEqual(parserSideRun.status);
  });
});

describe('the matcher the baseline defaults to', () => {
  it('is the lexical fallback, built over the active catalog', () => {
    const explicit = new LexicalOnlyMatcher(buildIndex(catalog.active()));

    expect(runBaseline({ catalog, cases })).toEqual(
      runBaseline({ catalog, cases, matcher: explicit }),
    );
  });

  it('answers the same way twice', () => {
    expect(runBaseline({ catalog, cases })).toEqual(runBaseline({ catalog, cases }));
  });
});

/** Every relative module the source reaches, statement by statement rather than line by
 * line, because a prettier-wrapped `import type {` spans several lines. Type-only imports
 * are left out: they are erased before anything runs. */
function reachableFrom(entry: URL): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current.pathname)) continue;
    seen.add(current.pathname);

    for (const statement of readFileSync(current, 'utf8').split(';')) {
      if (/^\s*(?:import|export)\s+type\b/.test(statement)) continue;
      const specifier = /from\s+'(\.[^']+)'/.exec(statement)?.[1];
      if (specifier !== undefined) pending.push(new URL(`${specifier}.ts`, current));
    }
  }

  return seen;
}

describe('what the baseline reaches at run time', () => {
  const reached = [...reachableFrom(new URL('baseline.ts', import.meta.url))];

  it('never reaches a parser', () => {
    expect(reached.filter((path) => /queryParser|descriptionParser/.test(path))).toEqual([]);
  });

  // Without this, a walk that silently reached nothing would pass the test above.
  it('reaches the lexical fallback it exists to measure', () => {
    expect(reached.filter((path) => path.endsWith('matching/lexicalFallback.ts'))).toHaveLength(1);
  });
});
