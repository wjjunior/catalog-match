// The wire contract, mirrored from packages/core/src/domain/match.ts. It lives here
// because the core barrel is still empty and PRG-27 owns the zod schema; when that card
// merges, these declarations are replaced by the schema's inferred types.

export type Provenance = 'explicit' | 'inferred' | 'corrected' | 'approximate' | 'unrecognized';

export type AttributeName =
  'diameter' | 'pitch' | 'length' | 'type' | 'material' | 'finish' | 'standard';

export type MatchStatus = 'unique' | 'ambiguous' | 'none' | 'history' | 'unparsed';

export type NoteCode =
  | 'failedConstraint'
  | 'unknownDiameter'
  | 'unknownType'
  | 'unitMismatch'
  | 'discontinued'
  | 'customerRequired'
  | 'historyReference'
  | 'unverifiedResidue';

export type ConfidenceLabel = 'High' | 'Medium' | 'Low';

export interface Note {
  code: NoteCode;
  message: string;
}

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
  components: { compatibility: number; prior: number };
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
  /** The parse is explained through `results[].explanation`; the page never reads it. */
  parsed: unknown;
  status: MatchStatus;
  compatibleCount: number;
  results: Match[];
  alternatives: Alternative[];
  notes: Note[];
  timingsMs: { parse: number; match: number };
}

export interface CustomerSummary {
  customerId: string;
  customerName: string;
  orderCount: number;
  lastOrderDate: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`The request failed with status ${status}.`);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function decode<T>(response: Response): Promise<T> {
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

export async function postMatch(
  request: MatchRequest,
  signal?: AbortSignal,
): Promise<MatchResponse> {
  const response = await fetch('/api/match', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  return decode<MatchResponse>(response);
}

export async function getCustomers(q: string, signal?: AbortSignal): Promise<CustomerSummary[]> {
  const response = await fetch(`/api/customers?q=${encodeURIComponent(q)}`, { signal });

  return decode<CustomerSummary[]>(response);
}
