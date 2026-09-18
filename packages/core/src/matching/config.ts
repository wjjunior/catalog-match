/** Relaxed in order, stopping at the first non-empty step. Diameter and type are never
 * relaxed. docs/DESIGN.md 5.6. */
export const BACKOFF_STEPS = [
  'standard',
  'materialFinishFamily',
  'approximateLength',
  'dropLength',
] as const;

export type BackoffStep = (typeof BACKOFF_STEPS)[number];

/** Credit for a term that identifies an attribute weakly, named so the lexicon can
 * reference a level instead of repeating a number: "washer" is generic, "bolt" ambiguous. */
export interface TermStrengths {
  /** A term that shortens a value with no rival: "yellow" can only be yellow zinc. */
  readonly shortForm: number;
  readonly weak: number;
  readonly generic: number;
  readonly ambiguous: number;
  readonly distant: number;
}

export interface LabelThresholds {
  readonly high: number;
  readonly medium: number;
  /** True until PRG-36 measures them; no document or test may promise a label while it is. */
  readonly provisional: boolean;
}

/** The symbols are those of docs/DESIGN.md 5.5 and 7.2. Values are tuned once, in
 * PRG-36; no other card changes one. */
export interface MatcherConfig {
  readonly epsilon: number;
  readonly kappa: number;
  readonly tauDays: number;
  readonly k: number;
  readonly alpha: number;
  readonly wSku: number;
  readonly familyCredit: number;
  readonly fuzzyStrength: number;
  readonly termStrengths: TermStrengths;
  readonly labels: LabelThresholds;
  readonly backoffOrder: readonly BackoffStep[];
  readonly lengthTolerance: number;
  readonly lexicalCap: number;
  readonly historyConfidence: number;
  readonly historyDecayPerRank: number;
}

export const DEFAULT_MATCHER_CONFIG: MatcherConfig = {
  epsilon: 0.02,
  kappa: 3,
  tauDays: 180,
  k: 5,
  alpha: 0.5,
  wSku: 2,
  familyCredit: 0.8,
  fuzzyStrength: 0.9,
  termStrengths: {
    shortForm: 0.9,
    weak: 0.7,
    generic: 0.6,
    ambiguous: 0.5,
    distant: 0.4,
  },
  labels: {
    high: 0.7,
    medium: 0.35,
    provisional: true,
  },
  backoffOrder: BACKOFF_STEPS,
  lengthTolerance: 0.25,
  lexicalCap: 0.4,
  historyConfidence: 0.7,
  historyDecayPerRank: 0.8,
};
