// Public API of @catalog-match/core. This barrel is the only entry point consumers
// may import; it is edited by the integration cards (PRG-22, PRG-26) as the use
// cases, ports, types, config, adapters and parsers land.

// Types only until createCore exists: the HTTP edge needs the wire types to state
// its zod schemas against, and apps/web/src may never pull core runtime code.
export type * from './domain';
