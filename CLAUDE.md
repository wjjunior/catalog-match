# Catalog Match: agent protocol

The spec for a piece of work is its Jira card (Context, Files owned, Scope, Acceptance
criteria) plus `docs/DESIGN.md` and `docs/BRIEF.md`. Read the card first; read the two
documents for anything the card leaves implicit. This file is the protocol around that
work and applies to every card.

## Workflow

- One Jira card per branch: `prg-<number>-<slug>`. One PR per card, titled
  `PRG-<number>: <summary>`.
- Small commits, conventional commits, **no co-author trailers**.
- Tests first, with vitest.
- A card is done only when `pnpm lint && pnpm typecheck && pnpm test` pass. The boundary
  rules are part of `pnpm lint`; a card is not done while they fail.
- State the card key in the first message of a session so the branch and the PR are
  named correctly.

## File ownership

- Each card lists the files it owns. Do not modify files owned by another in-flight card.
  When a card needs a file owned by another, wait for the merge or keep a local copy and
  reconcile at merge.
- `packages/core/src/index.ts` (the barrel) and `packages/core/src/application/*` are
  edited only by the integration cards (PRG-22 application use case, PRG-26
  personalization integration).
- Parameter _values_ in `packages/core/src/matching/config.ts` change only in PRG-36, the
  single calibration card. No other card runs `pnpm eval --heldout`.

## Architecture rules

Core is a hexagon, the web app is FSD-lite, and both are enforced by `eslint.config.mjs`
rather than by convention. The allow-lists there are the boundary table of
`docs/DESIGN.md` 4.2; changing one is an architecture change, so update the table in the
same commit.

### Import boundaries

Core inner ring = `domain/` (types, contracts, config), `parsing/`, `matching/`,
`personalization/`.

- inner ring imports inner ring only;
- `ports/` imports `domain/` only;
- `application/` imports the inner ring and `ports/`; `application/createCore.ts` is the
  only module allowed to import `adapters/`;
- `adapters/**` imports `ports/` and the inner ring; never `application/`;
- `eval/` imports `application/`, `ports/` and the inner ring; never `adapters/` (it
  receives a `Matcher`);
- `src/index.ts` is the only public entry; test files may import anything.

Web:

- `app/` imports `src/widgets`, `src/features`, `src/entities`, `src/shared`, `server/`;
- `server/` imports the `@catalog-match/core` public API (the only place core runtime code
  is imported);
- `src/widgets` imports features, entities, shared; `src/features` imports entities,
  shared; `src/entities` imports shared; `src/shared` imports nothing internal;
- `src/**` may import `@catalog-match/core` as `import type` only.

### Hexagon rules

- A port exists only when it has two adapters, or one adapter plus a test double in use.
  The ports are `CatalogRepository`, `OrderHistoryRepository` and `Matcher`; parser and
  prior interfaces are inner-ring contracts, not ports.
- Use cases are functions returning plain objects.
- No DTO or mapper layer: domain types are the wire types, with one zod schema at the HTTP
  edge.
- No DI container: one composition root, `createCore`.
- No domain events, no CQRS, no generic `Repository<T>`.

### FSD-lite rules

- Imports only point downward, per the boundary rules above.
- A slice with a single file has no `index.ts`.
- No client-side matching logic.

## Determinism and configuration

- Every tunable parameter lives in `packages/core/src/matching/config.ts`. Never hard-code
  a threshold anywhere else.
- No network calls, no environment variables, no `.env` file, no dependence on the wall
  clock in results. Recency is measured from the latest date in the history file.

## Comments

Code speaks for itself. A comment earns its place only where the code cannot say the
thing: a trap, a constraint that is not visible in the signature, or a decision whose
opposite looks equally correct. Two lines at most, and none where a better name would do.

No JSDoc that restates a signature or a field name, no file banners, no section headers,
no comment describing what the next line does.

## Documentation

- Record an assumption in `docs/ASSUMPTIONS.md` only when a later card would otherwise
  undo it. When a decision is ambiguous, take it and continue; ask only when the answer
  changes the architecture. A long assumptions list is a sign the cards are unclear, not
  a sign of care.
- Never commit planning artifacts, `.superpowers/` or `*.plan.md`.
- English only in code, comments, docs and commit messages.

## Commands

| Command            | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm install`     | Install the workspace. Node ≥22.13 (see engines); .nvmrc pins 24.  |
| `pnpm lint`        | ESLint, including the architecture boundary rules.                 |
| `pnpm typecheck`   | `tsc --noEmit` at the root and in every package.                   |
| `pnpm test`        | vitest, once.                                                      |
| `pnpm build`       | Production build of the web app.                                   |
| `pnpm dev`         | Development server for the web app.                                |
| `pnpm run eval`    | Evaluation harness (placeholder until PRG-33).                     |
| `pnpm run profile` | Data profiling script (placeholder until PRG-11).                  |
| `pnpm format`      | Prettier. `docs/DESIGN.md` and `docs/BRIEF.md` are left untouched. |

`eval` and `profile` need `pnpm run`: `pnpm profile` resolves to pnpm's own built-in
command instead of the script.
