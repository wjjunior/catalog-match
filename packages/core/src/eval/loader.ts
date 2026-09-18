import type { MatchStatus } from '../domain/match';
import type { CatalogRepository } from '../ports/catalogRepository';

/** One labeled case, structurally the row `data/eval/schema.ts` validates. Declared here
 * so core states what it consumes instead of reaching outside its own package; the two
 * are held together by an assignability assertion in `scripts/eval.test.ts`. */
export interface EvalCase {
  id: string;
  query: string;
  customerId?: string;
  expectedStatus: MatchStatus;
  /** The active compatible set: every SKU the query admits, independent of ranking. */
  expected: string[];
  /** The one SKU that must rank first, where a label names one. */
  expectedTop1?: string;
  expectedAlternatives?: string[];
  tags: string[];
  rationale?: string;
}

export class EvalDataError extends Error {}

/** Checked before any metric runs: a label naming a SKU the catalog does not have is a
 * broken data set, and reading it as a matcher failure would be the wrong conclusion. */
export function loadCases(
  cases: readonly EvalCase[],
  catalog: CatalogRepository,
): readonly EvalCase[] {
  for (const entry of cases) {
    const reject = (reason: string): never => {
      throw new EvalDataError(`${entry.id}: ${reason}`);
    };

    const named: readonly (readonly [string, readonly string[]])[] = [
      ['expected', entry.expected],
      ['expectedTop1', entry.expectedTop1 === undefined ? [] : [entry.expectedTop1]],
      ['expectedAlternatives', entry.expectedAlternatives ?? []],
    ];

    for (const [field, skus] of named) {
      for (const sku of skus) {
        if (catalog.bySku(sku) === undefined) reject(`${field} SKU ${sku} is not in the catalog`);
      }
    }

    const seen = new Set<string>();
    for (const sku of entry.expected) {
      if (seen.has(sku)) reject(`expected repeats ${sku}`);
      seen.add(sku);
    }

    if (entry.expectedTop1 !== undefined && !seen.has(entry.expectedTop1)) {
      reject(`expectedTop1 ${entry.expectedTop1} is not in expected`);
    }
  }

  return cases;
}

/** The one SKU a case says the answer must rank first, or undefined where the label names
 * only acceptable ones. This is the line between the retrieval metrics and the set
 * metrics: they are scored on different cases because they are different claims. */
export function intendedSku(entry: EvalCase): string | undefined {
  if (entry.expectedTop1 !== undefined) return entry.expectedTop1;

  return entry.expected.length === 1 ? entry.expected[0] : undefined;
}
