import { InMemoryCatalogRepository } from '../../src/adapters/memory/inMemoryCatalogRepository';
import type { CatalogItem } from '../../src/domain/catalog';
import type { Match, MatchRequest, MatchResponse, MatchStatus } from '../../src/domain/match';
import type { EvalCase } from '../../src/eval/loader';
import type { CaseOutcome } from '../../src/eval/metrics';
import { descriptionParser } from '../../src/parsing/descriptionParser';
import { queryParser } from '../../src/parsing/queryParser';
import type { Matcher } from '../../src/ports/matcher';

const item = (sku: string, description: string, active = true): CatalogItem => ({
  catalogId: sku,
  sku,
  description,
  active,
  spec: descriptionParser.parse(description),
});

export const ITEMS: readonly CatalogItem[] = [
  item('SS', 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN'),
  item('BO', 'M8-1.25 FLAT WSHR DIN 912 A2 SS BLACK OXIDE'),
  item('BR', 'M8-1.25 FLAT WASHER ISO 7380 BRASS ZINC'),
  item('NUT', 'M16-2.0 HEX NUT ASTM A307 A2 SS HDG'),
  item('SILENT', '5/16 FLAT WASHER STEEL PLAIN'),
  item('SCREW', 'M8-1.25 X 20MM SOCKET HEAD CAP SCREW DIN 912 A2 SS PLAIN'),
  // A row the catalog dropped: a referenced order still names it, so the harness must
  // leave room for it in the limit it raises to.
  item('GONE', 'M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN', false),
];

export const catalog = new InMemoryCatalogRepository([...ITEMS]);

const bySku = new Map(ITEMS.map((entry) => [entry.sku, entry]));

export function matchOf(sku: string, confidence: number): Match {
  const found = bySku.get(sku);
  if (found === undefined) throw new Error(`no fixture for ${sku}`);

  return {
    sku,
    catalogId: found.catalogId,
    description: found.description,
    active: found.active,
    confidence,
    explanation: {
      matched: [],
      unspecified: [],
      unverified: [],
      compatibleCount: 0,
      disambiguateBy: [],
    },
    components: { compatibility: confidence, prior: 0 },
  };
}

export function responseOf(
  query: string,
  skus: readonly string[],
  status: MatchStatus,
  confidences?: readonly number[],
): MatchResponse {
  return {
    query,
    parsed: queryParser.parse(query),
    status,
    compatibleCount: skus.length,
    results: skus.map((sku, rank) => matchOf(sku, confidences?.[rank] ?? 1 / (rank + 1))),
    alternatives: [],
    notes: [],
    timingsMs: { parse: 0, match: 0 },
  };
}

export const caseOf = (overrides: Partial<EvalCase> = {}): EvalCase => ({
  id: 'c-01',
  query: 'M8 flat washer',
  expectedStatus: 'ambiguous',
  expected: ['SS', 'BO'],
  tags: [],
  ...overrides,
});

export interface OutcomeOptions {
  status?: MatchStatus;
  confidences?: readonly number[];
  without?: readonly string[];
  latencyMs?: number;
}

export function outcomeOf(
  entry: EvalCase,
  skus: readonly string[],
  options: OutcomeOptions = {},
): CaseOutcome {
  const status = options.status ?? entry.expectedStatus;
  const full = responseOf(entry.query, skus, status, options.confidences);

  return {
    entry,
    full,
    served: { ...full, results: full.results.slice(0, 3) },
    ...(options.without === undefined
      ? {}
      : { withoutCustomer: responseOf(entry.query, options.without, status) }),
    latencyMs: options.latencyMs ?? 1,
  };
}

export interface StubAnswer {
  skus: readonly string[];
  status?: MatchStatus;
  confidences?: readonly number[];
  /** The answer for the same query asked without a customer. */
  withoutCustomer?: readonly string[];
}

/** Returns the whole set and slices it by the request's limit, as the real use case does,
 * so a harness that forgets to raise the limit is measured short and the test says so. */
export function stubMatcher(answers: Readonly<Record<string, StubAnswer>>): {
  matcher: Matcher;
  seen: MatchRequest[];
} {
  const seen: MatchRequest[] = [];

  const matcher: Matcher = {
    match: (request) => {
      seen.push(request);
      const answer = answers[request.query];
      if (answer === undefined) throw new Error(`no stub answer for ${request.query}`);

      const skus =
        request.customerId === undefined && answer.withoutCustomer !== undefined
          ? answer.withoutCustomer
          : answer.skus;
      const full = responseOf(
        request.query,
        skus,
        answer.status ?? 'ambiguous',
        answer.confidences,
      );

      return { ...full, results: full.results.slice(0, request.limit ?? 3) };
    },
  };

  return { matcher, seen };
}
