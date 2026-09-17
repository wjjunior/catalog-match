import type { CatalogItem, CustomerProfile } from './catalog';
import type { ParsedSpec } from './spec';

// These are not ports: each has one implementation plus test doubles inside the ring,
// and none of them leaves packages/core. docs/DESIGN.md 4.2.

/** Strict: tested to parse all 960 catalog SKUs against the SKU encoding. */
export interface DescriptionParser {
  parse(description: string): ParsedSpec;
}

/** Permissive: records for every attribute how it was obtained. */
export interface QueryParser {
  parse(query: string): ParsedSpec;
}

export interface HistoryPrior {
  /** Returns q_i aligned with `candidates` and summing to 1; an undefined profile
   * yields the uniform distribution. docs/DESIGN.md 7.2. */
  prior(
    candidates: readonly CatalogItem[],
    spec: ParsedSpec,
    profile: CustomerProfile | undefined,
  ): number[];
}
