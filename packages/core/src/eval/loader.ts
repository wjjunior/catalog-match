import type { MatchStatus } from '../domain/match';
import type { CatalogRepository } from '../ports/catalogRepository';

export interface EvalCase {
  id: string;
  query: string;
  customerId?: string;
  expectedStatus: MatchStatus;
  expected: string[];
  expectedTop1?: string;
  expectedAlternatives?: string[];
  tags: string[];
  rationale?: string;
}

export class EvalDataError extends Error {}

type Reject = (reason: string) => never;

function rejectFor(id: string): Reject {
  return (reason) => {
    throw new EvalDataError(`${id}: ${reason}`);
  };
}

function requireInCatalog(
  field: string,
  skus: readonly string[],
  catalog: CatalogRepository,
  reject: Reject,
): void {
  for (const sku of skus) {
    if (catalog.bySku(sku) === undefined) reject(`${field} SKU ${sku} is not in the catalog`);
  }
}

function requireUniqueExpected(expected: readonly string[], reject: Reject): Set<string> {
  const seen = new Set<string>();

  for (const sku of expected) {
    if (seen.has(sku)) reject(`expected repeats ${sku}`);
    seen.add(sku);
  }

  return seen;
}

function requireTop1InExpected(
  expectedTop1: string | undefined,
  expected: ReadonlySet<string>,
  reject: Reject,
): void {
  if (expectedTop1 !== undefined && !expected.has(expectedTop1)) {
    reject(`expectedTop1 ${expectedTop1} is not in expected`);
  }
}

function validateCase(entry: EvalCase, catalog: CatalogRepository): void {
  const reject = rejectFor(entry.id);

  requireInCatalog('expected', entry.expected, catalog, reject);
  requireInCatalog(
    'expectedTop1',
    entry.expectedTop1 === undefined ? [] : [entry.expectedTop1],
    catalog,
    reject,
  );
  requireInCatalog('expectedAlternatives', entry.expectedAlternatives ?? [], catalog, reject);

  const expected = requireUniqueExpected(entry.expected, reject);
  requireTop1InExpected(entry.expectedTop1, expected, reject);
}

export function loadCases(
  cases: readonly EvalCase[],
  catalog: CatalogRepository,
): readonly EvalCase[] {
  for (const entry of cases) validateCase(entry, catalog);

  return cases;
}

export function intendedSku(entry: EvalCase): string | undefined {
  if (entry.expectedTop1 !== undefined) return entry.expectedTop1;

  return entry.expected.length === 1 ? entry.expected[0] : undefined;
}
