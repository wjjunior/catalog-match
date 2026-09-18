// The personalization slice as the application layer sees it: a profile, the prior it
// induces over the compatible set, the reason a match carries, and history references.

export { buildProfile } from './customerProfile';
export { createHistoryPrior, historyPrior } from './historyPrior';
export type { HistoryPriorResult, PriorReason } from './historyPrior';
export { resolveReference, statesOverride } from './historyReference';
export type { HistoryReference, ReferencedLine } from './historyReference';
export { detectIntent, INTENT_PHRASES } from './intent';
export type { Intent } from './intent';
export { personalize } from './personalize';
