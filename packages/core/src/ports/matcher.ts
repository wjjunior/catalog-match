import type { MatchRequest, MatchResponse } from '../domain/match';

export interface Matcher {
  /** Never throws on unparseable text: the response carries status `unparsed`. */
  match(request: MatchRequest): MatchResponse;
}
