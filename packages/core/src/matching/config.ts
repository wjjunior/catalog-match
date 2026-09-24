export const BACKOFF_STEPS = [
  'standard',
  'materialFinishFamily',
  'approximateLength',
  'dropLength',
] as const;

export type BackoffStep = (typeof BACKOFF_STEPS)[number];

export interface TermStrengths {
  readonly shortForm: number;
  readonly weak: number;
  readonly generic: number;
  readonly ambiguous: number;
  readonly distant: number;
}

export interface LabelThresholds {
  readonly high: number;
  readonly medium: number;
  readonly provisional: boolean;
}

export interface MatcherConfig {
  readonly epsilon: number;
  readonly kappa: number;
  readonly tauDays: number;
  readonly k: number;
  readonly alpha: number;
  readonly wSku: number;
  readonly siblingCredit: number;
  readonly familyCredit: number;
  readonly fuzzyStrength: number;
  readonly termStrengths: TermStrengths;
  readonly labels: LabelThresholds;
  readonly backoffOrder: readonly BackoffStep[];
  readonly lengthTolerance: number;
  readonly tieTolerance: number;
  readonly lexicalCap: number;
  readonly lexicalUniqueGap: number;
  readonly historyConfidence: number;
  readonly historyDecayPerRank: number;
}

export const DEFAULT_MATCHER_CONFIG: MatcherConfig = {
  epsilon: 0.02,
  kappa: 3,
  tauDays: 180,
  k: 5,
  alpha: 1,
  wSku: 2,
  siblingCredit: 0.5,
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
    high: 0.8,
    medium: 0.35,
    provisional: false,
  },
  backoffOrder: BACKOFF_STEPS,
  lengthTolerance: 0.25,
  tieTolerance: 1e-9,
  lexicalCap: 0.4,
  lexicalUniqueGap: 0.01,
  historyConfidence: 0.7,
  historyDecayPerRank: 0.8,
};
