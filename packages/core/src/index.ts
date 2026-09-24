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
