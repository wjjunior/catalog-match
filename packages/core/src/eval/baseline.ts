import { buildIndex, LexicalOnlyMatcher } from '../matching/lexicalFallback';
import type { CatalogRepository } from '../ports/catalogRepository';
import type { Matcher } from '../ports/matcher';
import type { EvalCase } from './loader';
import type { CaseOutcome, RetrievalMetrics, SetRecoveryMetrics, StatusConfusion } from './metrics';
import { setRecovery } from './metrics';
import { run } from './run';

export interface BaselineInput {
  readonly catalog: CatalogRepository;
  readonly cases: readonly EvalCase[];
  readonly matcher?: Matcher;
}

export interface BaselineComparison {
  retrieval: RetrievalMetrics;
  setRecovery: SetRecoveryMetrics;
  status: StatusConfusion;
}

function budgeted(matcher: Matcher, cases: readonly EvalCase[]): CaseOutcome[] {
  return cases
    .filter((entry) => entry.expected.length > 0)
    .map((entry) => {
      const response = matcher.match({ query: entry.query, limit: entry.expected.length });

      return { entry, full: response, served: response, latencyMs: 0 };
    });
}

export function runBaseline({ catalog, cases, matcher }: BaselineInput): BaselineComparison {
  const lexical = matcher ?? new LexicalOnlyMatcher(buildIndex(catalog.active()));
  const report = run({ matcher: lexical, catalog, cases });

  return {
    retrieval: report.retrieval,
    setRecovery: setRecovery(budgeted(lexical, cases)),
    status: report.status,
  };
}
