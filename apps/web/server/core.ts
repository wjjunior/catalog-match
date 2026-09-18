import type { CustomerSummary, MatchRequest, MatchResponse } from '@catalog-match/core';

/** What createCore returns. Declared here because application/ belongs to PRG-22;
 * PRG-29 replaces the body of getCore with `createCore({ dataDir })`. */
export interface Core {
  matchQuery(request: MatchRequest): MatchResponse;
  listCustomers(q?: string): readonly CustomerSummary[];
}

let core: Core | undefined;

export function setCoreForTests(stub: Core | undefined): void {
  core = stub;
}

export function getCore(): Core {
  if (core === undefined) {
    throw new Error('The matching core is not wired yet: createCore lands in PRG-22.');
  }

  return core;
}
