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
  /** The lexical fallback is what "the baseline" means; injected only so a test can watch
   * the budget each case is asked for. */
  readonly matcher?: Matcher;
}

/** Three metrics, not the seven of an ordinary run. The baseline states no attribute, so
 * constraint preservation would report a perfect score for promising nothing; it knows no
 * customer, so personalization would compare a customer against itself; its confidence is
 * a capped token overlap, so calibration would bin a number that is not a posterior.
 * Publishing those as ties would flatter it. docs/DESIGN.md 10.4. */
export interface BaselineComparison {
  retrieval: RetrievalMetrics;
  setRecovery: SetRecoveryMetrics;
  status: StatusConfusion;
}

/** The baseline ranks every row holding a query token, so scoring its set recovery over
 * everything the raised limit returns would measure the limit rather than the ranking. Each
 * case is asked for as many results as its label holds: the size of the answer, handed over
 * for free, which makes the remaining gap a floor on what the parser adds. */
function budgeted(matcher: Matcher, cases: readonly EvalCase[]): CaseOutcome[] {
  return cases
    .filter((entry) => entry.expected.length > 0)
    .map((entry) => {
      const response = matcher.match({ query: entry.query, limit: entry.expected.length });

      // `setRecovery` reads the case and the answer; at this budget the served answer is
      // that same one, and no latency is measured on a pass that reports none.
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
