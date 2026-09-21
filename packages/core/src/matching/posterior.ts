import type { CatalogItem } from '../domain/catalog';
import type { ConfidenceLabel } from '../domain/match';
import type { MatcherConfig } from './config';

export interface PosteriorDistribution {
  /** Keyed by SKU, so the caller never has to keep C and the values in step by index. */
  readonly p: ReadonlyMap<string, number>;
  readonly pNull: number;
}

/** q_i without a customer: docs/DESIGN.md 5.5. */
export function uniformPrior(C: readonly CatalogItem[]): number[] {
  if (C.length === 0) return [];
  const share = 1 / C.length;
  return C.map(() => share);
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

export interface ConfidenceLabelling {
  readonly label: ConfidenceLabel;
  /** True while the thresholds are unmeasured, when no document or test may promise the
   * label. docs/DESIGN.md 5.5. */
  readonly provisional: boolean;
}

export function labelFor(p: number, config: MatcherConfig): ConfidenceLabelling {
  const { high, medium, provisional } = config.labels;
  const label: ConfidenceLabel = p >= high ? 'High' : p >= medium ? 'Medium' : 'Low';

  return { label, provisional };
}
