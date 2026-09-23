# Catalog Match

[![CI](https://github.com/wjjunior/catalog-match/actions/workflows/ci.yml/badge.svg)](https://github.com/wjjunior/catalog-match/actions/workflows/ci.yml)

Match a free-text fastener description to a catalog SKU, and when that is not possible, say
precisely why: which options remain and which attribute would settle it, or which requested
attribute the catalog cannot satisfy.

960 unique SKUs, 5 customers, 76 order lines. No network, no API keys, no environment
variables, no LLM in the request path.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Node 20 or newer. `docs/RUNBOOK.md` has the cold-start walkthrough and what to do when it
does not work; `docs/DEMO.md` is the scripted tour.

## What it does

Every catalog description follows one closed grammar:

```text
<diameter>[-<pitch>] [X <length><unit>] <type phrase> [<standard>] <material> <finish>

1/2-13 X 6FT FULL THREAD ROD STEEL ZINC
M4-0.7 X 60MM HEX CAP SCR DIN 912 STEEL YEL ZINC
#8-32 FLAT WSHR ASME B18.2.1 BRASS PLAIN
```

So the catalog is parsed once at ingest and the query is parsed at request time by the same
lexicon, and matching is set membership rather than similarity. The discriminating
information here is numeric — M8 against M6, 5/8 against 5/16, 30 mm against 50 mm — which
is exactly where a parser is exact and a dense embedding is weakest.

```text
query ──▶ normalize ──▶ parse (lexicon, fuzzy, provenance) ──▶ intent?
                                                                 │
                              compatible set C over active items ◀┘
                                                                 │
              ┌──────────────────────────────────────────────────┤
              ▼                          ▼                       ▼
        C empty: status none       |C| = 1: unique        |C| > 1: ambiguous
        backoff alternatives       posterior              history prior re-ranks C
```

**The status comes before the number.** A low confidence is never the signal for "not in
the catalog"; the status is. Five of them: `unique`, `ambiguous`, `none`, `history`,
`unparsed`. Seven valid options and no valid option both sit low on any score, so a
threshold cannot tell them apart — which is why the set decides first.

**History never overrides the query.** Personalization is a prior over C, and C is fixed
before a customer is looked at, so an explicit attribute wins by construction rather than by
a weight that could be tuned past it. `brass hex nut 1/2-13` returns brass for a customer
who only ever buys alloy, and the card says the query overrode the history.

## What the confidence number means

> `p_i` is the model's estimate that SKU i is the intended one, given the query, the
> customer, and the assumptions below. It is not a measured frequency.

```text
H = C ∪ {null}                       null = "the intended product is not in this catalog"
P(null) = ε = 0.02                   P(i) = (1 − ε) · q_i        q_i = customer prior over C
L(i) = s_i                           s_i = Π attribute credits, in (0, 1]
L(null) = κ^|residue|                κ = 3
p_i = (1 − ε) · q_i · s_i / [ (1 − ε) · Σ_j q_j · s_j + ε · κ^|residue| ]
```

ε and κ are set by hand; the model is small and explicit so the estimate can be taken apart,
and every response carries `components: { compatibility: s_i, prior: q_i }` so it can be.
The labels **High** (≥ 0.80) and **Medium** (≥ 0.35) were attached after the calibration
measurement in `docs/calibration.md`, not before it. See `docs/DESIGN.md` 5.5 and ADR-002.

## What the evaluation measured

Two labeled sets. The **golden set** (78 cases) seeded the tuning; the **held-out set**
(20 cases) was frozen on 2026-09-18 by a session that had not touched the lexicon or the
parsers, never consulted during development, and spent once, on 2026-09-21, after the last
defect was fixed. Tables in `docs/eval-report.md` and, kept in its own document so a later
run cannot overwrite it, `docs/eval-heldout.md`. Regenerate the golden one with
`pnpm run eval`.

| Metric                                | Golden (78) | Held-out (20) |
| ------------------------------------- | ----------- | ------------- |
| Hit@1 on single-label queries         | 1.000 (48)  | 1.000 (11)    |
| Exact-set rate on tie queries         | 0.967 (30)  | 1.000 (3)     |
| Status accuracy                       | 0.987       | 0.900         |
| Matches contradicting the query       | **0**       | **0**         |
| Personalization Hit@1 with a customer | 1.000 (21)  | 0.500 (2)     |
| p95 latency through the use case      | 0.4 ms      | 0.3 ms        |

Against the lexical baseline of `docs/DESIGN.md` 5.8 — the same BM25-lite the parser falls
back to, run alone over the same golden cases — Hit@1 1.000 against 0.167 and status
accuracy 0.987 against 0.603. That comparison is the evidence for parse-and-score, in place
of the assertion.

## Limitations

These are limited evidence from a small hand-labeled set. They support the design choices
for this data; they establish neither calibration nor generalization to a catalog this one
has not seen.

- **Calibration is established in the top band only.** All 29 single-label golden cases land
  in the 0.9–1.0 bin at precision 1.000, which is a degenerate table: it supports High and
  says nothing about Medium or Low, where no single-label case falls. The held-out set adds
  11 cases across three bins, all at precision 1.000. Read the number as ordered, not as a
  frequency.
- **The personalized labels are circular.** A person wrote them looking at the same order
  history the algorithm reads, and there is no independent ground truth for what a customer
  meant. The mitigations are procedural only: labels frozen before any parameter moved, each
  carrying its reasoning (`docs/eval/golden-rationale.md`), the held-out set untouched, and
  constraint preservation measured against the query rather than against any label.
- **Two hand-enumerated vocabularies do not generalize.** The held-out run found one miss in
  each: `square head set screw M6` should be `none` and is `ambiguous`, because the unstocked-type
  list carries `square head bolt` and not `set screw`; `send the flat washers we had on the
last order` should be `history` and is `ambiguous`, because the intent list carries
  `last time` and not `last order`. Both were left unfixed — adding the two phrases would
  spend the held-out evidence to flatter the number. `docs/eval/heldout-policy.md`.
- **One golden case fails, and it is a specification question.** `same washers as last time,
but brass` turns on which attributes of the referenced order survive an override, which
  `docs/DESIGN.md` 7.4 does not say. It is recorded as open in section 15 rather than
  decided by whichever answer makes the test pass.
- **20 held-out cases is a small number.** Status accuracy 0.900 on 20 cases is two misses.

## Architecture

`packages/core` is a hexagon and `apps/web` is FSD-lite, both enforced by
`eslint.config.mjs` rather than by convention — a deliberate boundary violation fails
`pnpm lint`.

```text
packages/core/src
  domain/            types, inner-ring contracts, config
  parsing/           normalize, units, lexicon, fuzzy, both parsers
  matching/          compatibility + status + backoff, ranking, posterior, explainer, config
  personalization/   profile, history prior, intent, history references
  ports/             CatalogRepository, OrderHistoryRepository, Matcher
  application/       matchQuery, listCustomers, createCore (the one composition root)
  adapters/          csv/, memory/
  eval/              loaders, metrics, baseline runner, report writer
apps/web
  app/               page.tsx, api/match, api/customers
  server/core.ts     the only place core runtime code is imported
  src/               widgets → features → entities → shared, downward imports only
```

Three ports, because a port exists only where it has two adapters or one plus a test double
in use. No DTO layer: the domain types are the wire types, validated once by a zod schema at
the HTTP edge. No DI container, no domain events, no CQRS, no generic repository.

The data layer is in memory, loaded from CSV behind `CatalogRepository` and
`OrderHistoryRepository` (ADR-004). A Postgres or pgvector implementation is a new folder
under `adapters/` and one line in `createCore`; nothing above the ports changes. 960 items
do not justify the infrastructure today.

Decisions and their alternatives: `docs/adr/`. ADR-005 records why there is no LLM in the
matching path, and what would make that worth revisiting.

## How the coding agent was used

AI is used in the development process, not at runtime (ADR-005). The work was cut into 34
Jira cards across 10 dependency waves, and run as parallel Claude Code instances, one per
card, each in its own git worktree with its own branch and pull request. `CLAUDE.md` is the
protocol every instance reads: which files a card owns, tests first with vitest, conventional
commits, and a card is not done until `pnpm lint && pnpm typecheck && pnpm test` pass.

What the process enforced rather than trusted:

- **Boundaries are lint rules, not review comments.** The allow-lists in `eslint.config.mjs`
  are the boundary table of `docs/DESIGN.md` 4.2. An agent cannot quietly import an adapter
  from the inner ring.
- **Parameter values move in exactly one card.** Only PRG-36 could edit values in
  `matching/config.ts`, and it had to record every sweep in `docs/calibration.md`, including
  the parameters it left alone and why. That is what keeps "unchanged" a measurement.
- **The held-out set was written by an instance that could not see the parser.** It never
  opened `parsing/`, `matching/` or the parser specification, and derived its expectations
  from the data files. A set written by someone who knows which abbreviations are covered
  measures the implementation, not a distributor's words.
- **CI gates the floor from `main`, not from the branch.** A change that regresses status
  accuracy or constraint preservation cannot lower the bar it is measured against in the
  same commit.

Reviewed by hand rather than delegated: the golden set line by line before merge, the
compatible-set and status rules (the structural guarantee behind "explicit attributes always
win"), the posterior properties, the mixture prior, and every parameter change. The failures
above are reported because the process surfaced them, not because it was asked to.

## Commands

| Command            | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `pnpm install`     | Install the workspace. Node 20 or newer.                                 |
| `pnpm dev`         | Development server for the web app.                                      |
| `pnpm build`       | Production build.                                                        |
| `pnpm lint`        | ESLint, including the architecture boundary rules.                       |
| `pnpm typecheck`   | `tsc --noEmit` at the root and in every package.                         |
| `pnpm test`        | vitest, once.                                                            |
| `pnpm run demo`    | The scripted demo of `docs/DEMO.md`, through the real core.              |
| `pnpm run eval`    | Golden set against the lexical control; `--heldout` adds the frozen set. |
| `pnpm run profile` | Reproduces the data findings of `docs/DESIGN.md` 3.                      |

`eval`, `profile` and `demo` need `pnpm run`: `pnpm profile` resolves to pnpm's own built-in
command instead of the workspace script.
