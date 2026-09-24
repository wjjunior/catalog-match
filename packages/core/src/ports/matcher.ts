import type { MatchRequest, MatchResponse } from '../domain/match';

export interface Matcher {
  match(request: MatchRequest): MatchResponse;
}
