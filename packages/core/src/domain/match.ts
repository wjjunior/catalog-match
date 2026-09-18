import type { AttributeName, ParsedSpec, Provenance } from './spec';

/** Decided by the compatible set before any number; a threshold never stands in for
 * `none`. docs/DESIGN.md 5.3. */
export const MATCH_STATUSES = ['unique', 'ambiguous', 'none', 'history', 'unparsed'] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const NOTE_CODES = [
  'failedConstraint',
  'unknownDiameter',
  'unknownType',
  'unitMismatch',
  'discontinued',
  'customerRequired',
  'historyReference',
  'unverifiedResidue',
] as const;

export type NoteCode = (typeof NOTE_CODES)[number];

export interface Note {
  code: NoteCode;
  message: string;
}

export type ConfidenceLabel = 'High' | 'Medium' | 'Low';

export interface MatchedAttribute {
  attr: AttributeName;
  query: string;
  item: string;
  provenance: Provenance;
  /** True when the agreement is at family level rather than exact. */
  partial?: boolean;
}

export interface PersonalizationExplanation {
  reason: string;
  prior: number;
  overriddenBy?: AttributeName[];
}

export interface Explanation {
  matched: MatchedAttribute[];
  unspecified: AttributeName[];
  unverified: string[];
  compatibleCount: number;
  disambiguateBy: AttributeName[];
  /** `relaxed` and `closeness` are set on alternatives only. */
  relaxed?: string[];
  closeness?: number;
  personalization?: PersonalizationExplanation;
}

export interface Match {
  sku: string;
  catalogId: string;
  description: string;
  active: boolean;
  confidence: number;
  label?: ConfidenceLabel;
  explanation: Explanation;
  /** The s_i and q_i of docs/DESIGN.md 5.4 and 7.2, so a posterior can be taken apart. */
  components: {
    compatibility: number;
    prior: number;
  };
}

/** Reached by relaxing a stated constraint, so it carries closeness and never a
 * confidence. docs/DESIGN.md 5.6. */
export interface Alternative {
  sku: string;
  catalogId: string;
  description: string;
  active: boolean;
  closeness: number;
  relaxed: string[];
  explanation: Explanation;
}

export interface MatchRequest {
  query: string;
  customerId?: string;
  /** Defaults to 3. */
  limit?: number;
}

export interface MatchResponse {
  query: string;
  parsed: ParsedSpec;
  status: MatchStatus;
  compatibleCount: number;
  results: Match[];
  alternatives: Alternative[];
  notes: Note[];
  timingsMs: { parse: number; match: number };
}
