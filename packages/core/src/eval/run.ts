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

const SERVED_LIMIT = 3;

export interface EvalRunInput {
  readonly matcher: Matcher;
  readonly catalog: CatalogRepository;
  readonly cases: readonly EvalCase[];
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

export function run({
  matcher,
  catalog,
  cases,
  clock = () => performance.now(),
}: EvalRunInput): EvalReport {
  const validated = loadCases(cases, catalog);
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
