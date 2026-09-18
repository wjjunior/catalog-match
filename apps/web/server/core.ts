import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createCore } from '@catalog-match/core';
import type { CustomerSummary, MatchRequest, MatchResponse } from '@catalog-match/core';

/** The web app needs these two; the core's own Core also carries catalog, history and
 * config, and satisfies this structurally, so test stubs stay small. */
export interface Core {
  matchQuery(request: MatchRequest): MatchResponse;
  listCustomers(q?: string): readonly CustomerSummary[];
}

/** cwd is apps/web under next dev, build and start, and the repository root under vitest,
 * so the data directory is found by walking up rather than by a fixed relative path. */
export function findDataDir(from: string = process.cwd()): string {
  const start = resolve(from);
  let dir = start;

  for (;;) {
    if (existsSync(join(dir, 'data', 'catalog.csv'))) return join(dir, 'data');

    const parent = dirname(dir);

    if (parent === dir) {
      throw new Error(`Could not find data/catalog.csv in ${start} or any directory above it.`);
    }

    dir = parent;
  }
}

let injected: Core | undefined;
let built: Core | undefined;

export function setCoreForTests(stub: Core | undefined): void {
  injected = stub;
}

export function getCore(): Core {
  if (injected !== undefined) return injected;

  // Lazy so `next build` never pays for parsing both CSVs, and so the p95 warm-up is stated
  // rather than accidental.
  built ??= createCore({ dataDir: findDataDir() });

  return built;
}
