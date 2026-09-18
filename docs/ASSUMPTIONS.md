# Assumptions

Every assumption taken while implementing a card, tagged with the card key.

## PRG-8

- **Node 24 in `.nvmrc`, `engines.node >= 20`.** The card asks for Node 20; the brief
  asks for Node 20+. The workspace was installed and verified on the machine's Node
  24.15.0, so `.nvmrc` pins 24 and `engines` keeps the floor the brief states.
- **TypeScript is pinned to `~6.0.3`, not the current latest (7.0.2).** `typescript-eslint`
  8.70 declares `typescript >=4.8.4 <6.1.0`; 6.0.3 is the newest release inside that range.
  Revisit when typescript-eslint supports TypeScript 7.
- **`packages/core` has no build step.** Its `exports` map points at `src/index.ts` and the
  web app lists it in `transpilePackages`, so there is one source of truth and no `dist/`
  to go stale. vitest and tsx resolve the same entry.
- **Boundaries are enforced with `eslint-plugin-boundaries`**, the design's first option,
  rather than dependency-cruiser. One tool, and the rules run inside `pnpm lint`.
- **`eslint-import-resolver-typescript` is mandatory, not cosmetic.** The plugin's default
  node resolver cannot follow extensionless TypeScript imports; without the resolver every
  boundary check resolves to nothing and silently passes. Do not remove it.
- **`packages/core/src/index.ts` is classified out of the boundary rules.** The barrel
  re-exports every layer by definition, so constraining it would only forbid its purpose.
  It stays owned by the integration cards.
- **`adapters/csv` and `adapters/memory` are one lint element (`core-adapters`).** No
  boundary rule distinguishes them.
- **`pnpm run profile`, not `pnpm profile`.** `profile` is a built-in pnpm command, so the
  bare form never reaches the workspace script. `eval` is written the same way for
  symmetry.
- **`eslint-config-next` is not installed.** `typescript-eslint` recommended plus a strict
  `tsc --noEmit` are the quality gates; the card scopes lint to the boundary rules.
- **Next's own agent rules are disabled (`agentRules: false`).** Next 16 writes an
  `AGENTS.md` and a `CLAUDE.md` into `apps/web` on every dev run and build. The agent
  protocol for this repository is `CLAUDE.md` at the root; a second, generated one would
  compete with it.
- **Prettier does not format `docs/DESIGN.md` or `docs/BRIEF.md`.** Both are committed as
  provided by the owner; reformatting them would rewrite documents this repository does
  not own.
