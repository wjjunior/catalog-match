import type { Finish, Material } from '../domain/attributes';
import { FINISH_FAMILY, MATERIAL_FAMILY } from '../domain/attributes';
import type { MatchResponse, MatchStatus } from '../domain/match';
import { MATCH_STATUSES } from '../domain/match';
import type { AttributeName, ParsedSpec, Provenance } from '../domain/spec';
import { ATTRIBUTE_NAMES } from '../domain/spec';
import type { CatalogRepository } from '../ports/catalogRepository';
import type { EvalCase } from './loader';
import { intendedSku } from './loader';

export interface CaseOutcome {
  readonly entry: EvalCase;
  /** The limit raised to cover the compatible set, so a rank below the served window is
   * still a rank and MRR is not silently truncated. */
  readonly full: MatchResponse;
  /** The same query at the limit the API actually serves; the only response latency is
   * measured on, because building 192 explanations is the harness, not the product. */
  readonly served: MatchResponse;
  /** The same query with the customer dropped, on personalized cases only. */
  readonly withoutCustomer?: MatchResponse;
  readonly latencyMs: number;
}

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const rate = (hits: number, total: number): number => (total === 0 ? 0 : hits / total);

const skusOf = (response: MatchResponse): string[] => response.results.map((match) => match.sku);

export interface RetrievalMetrics {
  cases: number;
  hit1: number;
  hit3: number;
  mrr: number;
}

/** Scored only where a label names one intended SKU: on a tie query every member is
 * acceptable and none is intended, so a hit rate there would answer a different claim. */
export function retrieval(outcomes: readonly CaseOutcome[]): RetrievalMetrics {
  const ranks = outcomes.flatMap((outcome) => {
    const intended = intendedSku(outcome.entry);
    if (intended === undefined) return [];

    return [skusOf(outcome.full).indexOf(intended) + 1];
  });

  return {
    cases: ranks.length,
    hit1: rate(ranks.filter((rank) => rank === 1).length, ranks.length),
    hit3: rate(ranks.filter((rank) => rank >= 1 && rank <= 3).length, ranks.length),
    mrr: mean(ranks.map((rank) => (rank === 0 ? 0 : 1 / rank))),
  };
}

export interface SetRecoveryMetrics {
  cases: number;
  precision: number;
  recall: number;
  exactSetRate: number;
}

/** Averaged per case rather than pooled over every SKU: the claim is about recovering a
 * query's set, so a query with 30 members must not outweigh one with 2. */
export function setRecovery(outcomes: readonly CaseOutcome[]): SetRecoveryMetrics {
  const scored = outcomes.filter(
    (outcome) => outcome.entry.expectedStatus === 'ambiguous' && outcome.entry.expected.length > 0,
  );

  const scores = scored.map((outcome) => {
    const expected = new Set(outcome.entry.expected);
    const returned = new Set(skusOf(outcome.full));
    const hits = [...returned].filter((sku) => expected.has(sku)).length;

    return {
      // An empty result recovered nothing; reading it as precision over an empty
      // selection would award 1 for answering nothing at all.
      precision: rate(hits, returned.size),
      recall: rate(hits, expected.size),
      exact: returned.size === expected.size && hits === expected.size ? 1 : 0,
    };
  });

  return {
    cases: scored.length,
    precision: mean(scores.map((score) => score.precision)),
    recall: mean(scores.map((score) => score.recall)),
    exactSetRate: mean(scores.map((score) => score.exact)),
  };
}

export type StatusMatrix = Readonly<Record<MatchStatus, Readonly<Record<MatchStatus, number>>>>;

export interface StatusConfusion {
  cases: number;
  accuracy: number;
  matrix: StatusMatrix;
}

export function statusConfusion(outcomes: readonly CaseOutcome[]): StatusConfusion {
  const matrix = Object.fromEntries(
    MATCH_STATUSES.map((expected) => [
      expected,
      Object.fromEntries(MATCH_STATUSES.map((actual) => [actual, 0])),
    ]),
  ) as Record<MatchStatus, Record<MatchStatus, number>>;

  let onDiagonal = 0;
  for (const outcome of outcomes) {
    const expected = outcome.entry.expectedStatus;
    const actual = outcome.served.status;
    matrix[expected][actual] += 1;
    if (expected === actual) onDiagonal += 1;
  }

  return { cases: outcomes.length, accuracy: rate(onDiagonal, outcomes.length), matrix };
}

export interface Offender {
  id: string;
  sku: string;
  attribute: AttributeName;
}

export interface ConstraintPreservation {
  cases: number;
  /** Returned matches, not attributes: one match contradicting two attributes is one
   * broken promise to the customer. */
  violations: number;
  offenders: Offender[];
}

const isMaterial = (value: string): value is Material => value in MATERIAL_FAMILY;

const isFinish = (value: string): value is Finish => value in FINISH_FAMILY;

/** What the customer asked for: an exact spelling, and a typo the parser repaired into one.
 * An inferred value is the parser's own reading and an approximate one is a deliberate
 * relaxation, so neither is a promise the answer can break. docs/DESIGN.md 10.2. */
const STATED = new Set<Provenance | undefined>(['explicit', 'corrected']);

/** True only when the item carries a value that differs from the one the query stated. An
 * item silent about an attribute is not contradicting it: a washer has no pitch, and the
 * golden set lists exactly such a row as a correct answer to a query that states one. */
function contradicts(attribute: AttributeName, query: ParsedSpec, item: ParsedSpec): boolean {
  switch (attribute) {
    case 'diameter':
      return (
        item.diameter !== undefined &&
        (item.diameter.system !== query.diameter?.system ||
          item.diameter.nominal !== query.diameter.nominal)
      );
    case 'pitch':
      return item.pitch !== undefined && item.pitch !== query.pitch;
    case 'length':
      // Millimetres scaled to integers, the resolution the catalog resolves lengths to.
      // A looser window here would wave through a length the matcher itself rejects.
      return (
        item.length !== undefined &&
        query.length !== undefined &&
        Math.round(item.length.mm * 1000) !== Math.round(query.length.mm * 1000)
      );
    case 'type': {
      const wanted = new Set((query.type ?? []).map((entry) => entry.value));
      const carried = item.type ?? [];
      return carried.length > 0 && !carried.some((entry) => wanted.has(entry.value));
    }
    case 'material': {
      const value = item.material?.value;
      if (value === undefined) return false;
      const wanted = query.material?.value;
      return value !== wanted && !(isMaterial(value) && MATERIAL_FAMILY[value] === wanted);
    }
    case 'finish': {
      const value = item.finish?.value;
      if (value === undefined) return false;
      const wanted = query.finish?.value;
      return value !== wanted && !(isFinish(value) && FINISH_FAMILY[value] === wanted);
    }
    case 'standard':
      return item.standard !== undefined && item.standard !== query.standard;
  }
}

/** Written against the catalog row and the query's own provenance rather than through
 * `compatibility.ts`: a matcher asked whether it agrees with itself always says yes, and
 * the number would stop being evidence exactly where it matters. docs/DESIGN.md 10.5. */
export function constraintPreservation(
  outcomes: readonly CaseOutcome[],
  catalog: CatalogRepository,
): ConstraintPreservation {
  const offenders: Offender[] = [];

  for (const outcome of outcomes) {
    for (const response of [outcome.full, outcome.withoutCustomer]) {
      if (response === undefined) continue;
      offenders.push(...brokenBy(outcome.entry.id, response, catalog));
    }
  }

  return { cases: outcomes.length, violations: offenders.length, offenders };
}

function brokenBy(id: string, response: MatchResponse, catalog: CatalogRepository): Offender[] {
  const found: Offender[] = [];
  {
    const query = response.parsed;
    const stated = ATTRIBUTE_NAMES.filter((name) => STATED.has(query.provenance[name]));

    for (const match of response.results) {
      const item = catalog.bySku(match.sku);
      const broken =
        item === undefined
          ? undefined
          : stated.find((attribute) => contradicts(attribute, query, item.spec));

      if (broken !== undefined) found.push({ id, sku: match.sku, attribute: broken });
    }
  }

  return found;
}

export interface PersonalizationMetrics {
  cases: number;
  hit1: number;
  hit1WithoutCustomer: number;
  /** Mean gap between top-1 and top-2 confidence: how far personalization moved the
   * intended item clear of the rest, not merely whether it reached the front. */
  margin: number;
  /** Its own denominator: a case answered with one result has no second to measure
   * against, so the margin is averaged over fewer cases than `cases`. */
  marginCases: number;
}

export function personalization(outcomes: readonly CaseOutcome[]): PersonalizationMetrics {
  const scored = outcomes.filter((outcome) => outcome.entry.customerId !== undefined);

  const top1 = (response: MatchResponse | undefined, intended: string | undefined): number =>
    response !== undefined && intended !== undefined && response.results[0]?.sku === intended
      ? 1
      : 0;

  const margins = scored.flatMap((outcome) => {
    const [first, second] = outcome.full.results;

    return first === undefined || second === undefined
      ? []
      : [first.confidence - second.confidence];
  });

  return {
    cases: scored.length,
    hit1: mean(scored.map((o) => top1(o.full, intendedSku(o.entry)))),
    hit1WithoutCustomer: mean(scored.map((o) => top1(o.withoutCustomer, intendedSku(o.entry)))),
    margin: mean(margins),
    marginCases: margins.length,
  };
}

export interface CalibrationBin {
  lower: number;
  upper: number;
  count: number;
  /** Absent rather than zero for an empty bin: no case fell here, which is not the same
   * as every case here being wrong. */
  precision: number | undefined;
}

export interface CalibrationMetrics {
  cases: number;
  bins: CalibrationBin[];
}

const BIN_COUNT = 10;

/** Every case whose label names one intended SKU and whose answer came from the posterior.
 * Keyed on the answer, not on the expected status: a history reference reports a recency
 * decay rather than a posterior, and binning two scales together would measure neither. */
export function calibration(outcomes: readonly CaseOutcome[]): CalibrationMetrics {
  const scored = outcomes.filter(
    (outcome) =>
      intendedSku(outcome.entry) !== undefined &&
      outcome.full.status !== 'history' &&
      outcome.full.status !== 'unparsed',
  );

  const buckets = Array.from({ length: BIN_COUNT }, () => ({ count: 0, hits: 0 }));

  for (const outcome of scored) {
    const first = outcome.full.results[0];
    if (first === undefined) continue;

    const index = Math.min(BIN_COUNT - 1, Math.floor(first.confidence * BIN_COUNT));
    const bucket = buckets[index];
    if (bucket === undefined) continue;

    bucket.count += 1;
    if (first.sku === intendedSku(outcome.entry)) bucket.hits += 1;
  }

  return {
    cases: scored.length,
    bins: buckets.map((bucket, index) => ({
      lower: index / BIN_COUNT,
      upper: (index + 1) / BIN_COUNT,
      count: bucket.count,
      precision: bucket.count === 0 ? undefined : bucket.hits / bucket.count,
    })),
  };
}

export interface LatencyMetrics {
  cases: number;
  p50: number;
  p95: number;
}

/** Nearest rank rather than interpolation: with 78 samples an interpolated percentile
 * reports a duration no request took. */
function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;

  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));

  return sorted[index] ?? 0;
}

export function latency(outcomes: readonly CaseOutcome[]): LatencyMetrics {
  const sorted = outcomes.map((outcome) => outcome.latencyMs).sort((a, b) => a - b);

  return { cases: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) };
}
