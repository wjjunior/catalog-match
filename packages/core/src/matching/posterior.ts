import type { CatalogItem } from '../domain/catalog';
import type { ConfidenceLabel } from '../domain/match';
import type { MatcherConfig } from './config';

export interface PosteriorDistribution {
  readonly p: ReadonlyMap<string, number>;
  readonly pNull: number;
}

/** p_i of docs/DESIGN.md 5.5 over H = C ∪ {null}. `s` and `q` are indexed by position in
 * `C`; an empty C leaves all the mass on null. */
export function posterior(
  C: readonly CatalogItem[],
  s: readonly number[],
  q: readonly number[],
  residueCount: number,
  config: MatcherConfig,
): PosteriorDistribution {
  if (s.length !== C.length || q.length !== C.length) {
    throw new Error(
      `posterior() needs s and q aligned with the compatible set: |C| = ${String(C.length)}, |s| = ${String(s.length)}, |q| = ${String(q.length)}`,
    );
  }

  const nullMass = config.epsilon * config.kappa ** residueCount;
  const itemMass = 1 - config.epsilon;

  // The length check above makes both fallbacks unreachable; they only narrow the reads.
  const terms = C.map((item, index) => ({
    sku: item.sku,
    weight: (s[index] ?? 0) * (q[index] ?? 0),
  }));

  const evidence = terms.reduce((sum, term) => sum + term.weight, 0);
  const denominator = itemMass * evidence + nullMass;

  return {
    p: new Map(terms.map((term) => [term.sku, (itemMass * term.weight) / denominator])),
    pNull: nullMass / denominator,
  };
}

/** Whether one value is shared by the whole set. The tolerance is relative because these
 * are quotients that agree mathematically without agreeing bit for bit. */
export function tied(values: readonly number[], tolerance: number): boolean {
  const highest = Math.max(...values);

  return values.every((value) => highest - value <= tolerance * highest);
}

export interface ConfidenceLabelling {
  readonly label: ConfidenceLabel;
  readonly provisional: boolean;
}

export function labelFor(p: number, config: MatcherConfig): ConfidenceLabelling {
  const { high, medium, provisional } = config.labels;

  let label: ConfidenceLabel;
  if (p >= high) label = 'High';
  else if (p >= medium) label = 'Medium';
  else label = 'Low';

  return { label, provisional };
}
