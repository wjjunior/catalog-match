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

## PRG-18

- **An unrecognized type phrase reaches matching as `provenance.type = 'unrecognized'`
  with no `spec.type`.** PRG-17 must set it. The compatibility filter turns that marker
  into a constraint no item satisfies, which is how `carriage bolt 3/8` reaches status
  `none` instead of becoming an ambiguous set of every active 3/8 item. It is the exact
  counterpart of `Diameter.known === false` for M14. Without the marker the query is
  indistinguishable from one that never mentioned a type.
- **`M8 x 3/4 hex cap screw` offers the 16 mm item, not the 20 mm one.** The card and
  `docs/DESIGN.md` 6 both name a 20 mm approximate alternative. No M8 hex cap screw exists
  at 20 mm: every M8 item at that length is a button socket cap screw (CAT-0404,
  CAT-1000), a pan machine screw (CAT-0689) or a socket head cap screw (CAT-0888), and
  widening to the whole hex-head family adds no 20 mm item either. `3/4"` is 19.05 mm and
  the `lengthTolerance` window is [14.2875, 23.8125] mm, so the alternative is CAT-0387,
  `M8-1.25 X 16MM HEX CAP SCREW ASTM A307 ALLOY BLACK OXIDE`, 3.05 mm away.
- **`compatibleSet`, `deriveStatus` and `failedConstraint` take no `MatcherConfig`.** The
  card writes `config` into their signatures, but nothing in set membership reads one:
  `familyCredit` and `termStrengths` are PRG-19's scoring inputs, and `lengthTolerance`
  and `backoffOrder` are used only by `alternatives`, which keeps the parameter.
- **Backoff steps are cumulative, and `relaxed` lists only constraints that were both
  specified and genuinely loosened.** Dropping a standard the query never named, or
  widening a query that already said `stainless`, records nothing, so
  `closeness = (specified - relaxed.length) / specified` stays honest.
- **Length equality compares millimetres scaled to integers** (`Math.round(mm * 1000)`).
  This is a float-representation guard, not a tunable threshold, so it is not a
  `config.ts` parameter.
