// Public API of @catalog-match/core. This barrel is the only entry point consumers
// may import; it is edited by the integration cards (PRG-22, PRG-26) as the use
// cases, ports, types, config, adapters, parsers and personalization land.

// apps/web/src may never pull core runtime code into the browser bundle, so the wire
// types it states its zod schemas against stay type-only here.
export type * from './domain';

export { createCore, createCoreFromRepositories } from './application/createCore';
export type { Core, CoreOptions, CoreRepositories } from './application/createCore';

export type { CatalogRepository } from './ports/catalogRepository';
export type { Matcher } from './ports/matcher';
export type { OrderHistoryRepository } from './ports/orderHistoryRepository';

export { BACKOFF_STEPS, DEFAULT_MATCHER_CONFIG } from './matching/config';
export type { BackoffStep, LabelThresholds, MatcherConfig, TermStrengths } from './matching/config';

export { CsvCatalogRepository } from './adapters/csv/csvCatalogRepository';
export { CsvOrderHistoryRepository } from './adapters/csv/csvOrderHistoryRepository';
export { InMemoryCatalogRepository } from './adapters/memory/inMemoryCatalogRepository';
export { InMemoryOrderHistoryRepository } from './adapters/memory/inMemoryOrderHistoryRepository';

export {
  buildProfile,
  createHistoryPrior,
  detectIntent,
  historyPrior,
  INTENT_PHRASES,
  personalize,
  resolveReference,
  statesOverride,
} from './personalization';
export type {
  HistoryPriorResult,
  HistoryReference,
  Intent,
  PriorReason,
  ReferencedLine,
} from './personalization';

export { descriptionParser, parseDescription } from './parsing/descriptionParser';
export { parseQuery, queryParser } from './parsing/queryParser';
export type { QueryParse } from './parsing/queryParser';
