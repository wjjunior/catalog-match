import type { AttributeName, ParsedSpec, Provenance } from './spec';

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
  'unboundLength',
  'unrankedPool',
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
  components: {
    compatibility: number;
    prior: number;
  };
}

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
