import type { MatchRequest, MatchResponse } from '../domain/match';
import type { CatalogRepository } from '../ports/catalogRepository';
import type { Matcher } from '../ports/matcher';
import type { EvalCase } from './loader';
import { loadCases } from './loader';
import type {
  AlternativeRecoveryMetrics,
  CalibrationMetrics,
  CaseOutcome,
  ConstraintPreservation,
  LatencyMetrics,
  PersonalizationMetrics,
  RetrievalMetrics,
  SetRecoveryMetrics,
  StatusConfusion,
} from './metrics';
import {
  alternativeRecovery,
  calibration,
  constraintPreservation,
  latency,
  personalization,
  retrieval,
  setRecovery,
  statusConfusion,
} from './metrics';

/** The limit the API serves, and the one latency is reported at. docs/DESIGN.md 8.2. */
const SERVED_LIMIT = 3;

export interface EvalRunInput {
  readonly matcher: Matcher;
  readonly catalog: CatalogRepository;
  readonly cases: readonly EvalCase[];
  /** Injected so a test can measure latency without depending on the machine it runs on. */
  readonly clock?: () => number;
}

export interface EvalReport {
  cases: number;
  retrieval: RetrievalMetrics;
  setRecovery: SetRecoveryMetrics;
  alternativeRecovery: AlternativeRecoveryMetrics;
  status: StatusConfusion;
  constraints: ConstraintPreservation;
  personalization: PersonalizationMetrics;
  calibration: CalibrationMetrics;
  latency: LatencyMetrics;
}

const requestFor = (entry: EvalCase, limit: number, customer: boolean): MatchRequest => ({
  query: entry.query,
  ...(customer && entry.customerId !== undefined ? { customerId: entry.customerId } : {}),
  limit,
});

/** Raising the limit must widen the window on one ranking, never produce a second one. */
function agree(entry: EvalCase, served: MatchResponse, full: MatchResponse): void {
  if (served.status !== full.status) {
    throw new Error(
      `${entry.id}: status ${served.status} at limit ${String(SERVED_LIMIT)} but ${full.status} at the raised limit`,
    );
  }
  if (served.compatibleCount !== full.compatibleCount) {
    throw new Error(
      `${entry.id}: compatibleCount ${String(served.compatibleCount)} at limit ${String(SERVED_LIMIT)} but ${String(full.compatibleCount)} at the raised limit`,
    );
  }

  served.results.forEach((match, index) => {
    const wider = full.results[index]?.sku;
    if (match.sku !== wider) {
      throw new Error(
        `${entry.id}: rank ${String(index + 1)} is ${match.sku} at limit ${String(SERVED_LIMIT)} but ${wider ?? 'absent'} at the raised limit`,
      );
    }
  });
}

/** Receives a Matcher and repositories; it never wires them. docs/DESIGN.md 4.2. */
export function run({
  matcher,
  catalog,
  cases,
  clock = () => performance.now(),
}: EvalRunInput): EvalReport {
  const validated = loadCases(cases, catalog);
  // Wide enough for any answer: the compatible set is drawn from the active catalog, and a
  // history answer names one catalog row per referenced order, inactive rows included.
  const fullLimit = Math.max(catalog.all().length, SERVED_LIMIT);

  const outcomes: CaseOutcome[] = validated.map((entry) => {
    const started = clock();
    const served = matcher.match(requestFor(entry, SERVED_LIMIT, true));
    const latencyMs = clock() - started;

    const full = matcher.match(requestFor(entry, fullLimit, true));
    agree(entry, served, full);

    return {
      entry,
      full,
      served,
      ...(entry.customerId === undefined
        ? {}
        : { withoutCustomer: matcher.match(requestFor(entry, fullLimit, false)) }),
      latencyMs,
    };
  });

  return {
    cases: outcomes.length,
    retrieval: retrieval(outcomes),
    setRecovery: setRecovery(outcomes),
    alternativeRecovery: alternativeRecovery(outcomes),
    status: statusConfusion(outcomes),
    constraints: constraintPreservation(outcomes, catalog),
    personalization: personalization(outcomes),
    calibration: calibration(outcomes),
    latency: latency(outcomes),
  };
}
