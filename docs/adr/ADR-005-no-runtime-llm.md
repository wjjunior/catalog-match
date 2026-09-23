# ADR-005: No LLM in the matching path

Status: Accepted
Date: 2026-09-21

## Context

A matcher for free-text queries is an obvious place to reach for a language model. This
catalog is a closed grammar and every example query is attribute-shaped.

## Decision

No language model runs in the request path. Two uses were considered and deferred rather
than dismissed: an `LlmQueryInterpreter` for queries the deterministic parser cannot cover,
and LLM-generated document expansion (doc2query style) for messier catalog text. Typos are
handled deterministically by fuzzy matching against the lexicon.

AI was used in the development process — the brief, the golden set, the lexicon seed and
the code — and not at runtime. The README states this and points here.

## Alternatives considered

| Option                              | Why not                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| LLM-only, "pick the top 3"          | Non-deterministic, no eval loop, opaque confidence, latency and cost. Never as the primary matcher                   |
| LLM query interpreter behind a flag | The parser plus fuzzy matching covers the query classes in scope; a flag adds an untested path and a demo dependency |

## Evidence

The parser covers this catalog completely: 960 of 960 unique SKUs yield a diameter, type,
material and finish, every token is understood, and the SKU encoding serves as an
independent oracle
(`packages/core/src/parsing/descriptionParser.catalog.test.ts`).

On the query side, over the 78 golden cases (`docs/eval-report.md`), Hit@1 is 1.000 on the
48 single-label cases and status accuracy is 0.987. One case, `1/2"`, falls through to the
lexical fallback and is reported `unparsed`, which is what its label expects. A runtime model would have to beat that while
adding non-determinism, latency and an untestable path.

Determinism is itself measured: the same inputs produce byte-identical metrics across runs,
which is what allows `data/eval/baseline.json` to act as a CI floor at all.

## Consequences

Every answer is reproducible and explainable from the code, the suite runs offline, and
there is no key to manage or bill. The cost is linguistic reach: a query whose meaning
lives outside the lexicon becomes residue, which lowers every confidence without
reordering, and is visible as `unparsed` rather than as a confident wrong answer.

## Revisit trigger

Either of the two conditions named in `docs/DESIGN.md` 11 and 13.3: the eval shows a
residue-heavy query class the lexicon cannot absorb, or a catalog where parser coverage
drops below roughly 95%. Both deferred options are measured against the same golden and
held-out sets before being switched on.
