import { join } from 'node:path';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import { CsvOrderHistoryRepository } from '../adapters/csv/csvOrderHistoryRepository';
import type { CustomerProfile, CustomerSummary } from '../domain/catalog';
import type { MatchRequest, MatchResponse } from '../domain/match';
import type { MatcherConfig } from '../matching/config';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { buildIndex } from '../matching/lexicalFallback';
import { descriptionParser } from '../parsing/descriptionParser';
import { buildProfile } from '../personalization';
import type { CatalogRepository } from '../ports/catalogRepository';
import type { OrderHistoryRepository } from '../ports/orderHistoryRepository';
import { listCustomers } from './listCustomers';
import { matchQuery } from './matchQuery';

export interface Core {
  matchQuery(request: MatchRequest): MatchResponse;
  listCustomers(q?: string): readonly CustomerSummary[];
  readonly catalog: CatalogRepository;
  readonly history: OrderHistoryRepository;
  readonly config: MatcherConfig;
}

export interface CoreOptions {
  readonly dataDir: string;
  readonly config?: MatcherConfig;
}

export interface CoreRepositories {
  readonly catalog: CatalogRepository;
  readonly history: OrderHistoryRepository;
  readonly config?: MatcherConfig;
}

/** Everything of the composition root that does not name a file, so tests, the eval
 * harness and property tests wire the same core over their own repositories. */
export function createCoreFromRepositories({
  catalog,
  history,
  config = DEFAULT_MATCHER_CONFIG,
}: CoreRepositories): Core {
  const index = buildIndex(catalog.active());

  // One profile per customer per catalog load: the history and the catalog it is
  // cross-checked against both change only when this core is built again.
  const profiles = new Map<string, CustomerProfile>();
  // An id the history has never seen is not a customer. It gets no profile, so it is
  // answered exactly as no customer is, and the cache stays the size of the customer
  // list however many ids arrive.
  const known = new Set(history.customers().map((customer) => customer.customerId));

  const profile = (customerId: string): CustomerProfile | undefined => {
    if (!known.has(customerId)) return undefined;

    const cached = profiles.get(customerId);
    if (cached !== undefined) return cached;

    const built = buildProfile(customerId, history.all(), catalog.all(), config);
    profiles.set(customerId, built);

    return built;
  };

  return {
    matchQuery: matchQuery({ catalog, index, config, history, profile }),
    listCustomers: listCustomers({ history }),
    catalog,
    history,
    config,
  };
}

/** The single composition root: the only module in core that may reach the adapters. */
export function createCore({ dataDir, config }: CoreOptions): Core {
  return createCoreFromRepositories({
    catalog: CsvCatalogRepository.load(join(dataDir, 'catalog.csv'), descriptionParser),
    history: CsvOrderHistoryRepository.load(join(dataDir, 'order_history.csv')),
    config,
  });
}
