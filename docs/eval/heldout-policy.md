# Held-out set policy

`data/eval/heldout.jsonl` is the only evidence in this project that no tuning has seen.
That is worth something only while the rules below hold.

Frozen on 2026-09-18, 20 cases.

## Rules

- The set is never used to adjust the lexicon or any parameter in
  `packages/core/src/matching/config.ts`. It is not consulted while a change is being made,
  and a failing held-out case is not a reason to change the lexicon or a parameter.
- It runs once, at the end, from the calibration card (PRG-36), after the parameters are
  fixed on the golden set.
- `pnpm eval` reports it separately from the golden set, with the number of cases behind
  every number (docs/DESIGN.md 10.3). Held-out numbers are never merged into golden ones.
- It is not a CI gate. CI gates status correctness and constraint preservation on the
  golden set; gating on the held-out set would turn it into a tuning target.
- No query in this set equals a golden query after normalizing case, whitespace and
  separators. `scripts/heldout.test.ts` enforces this against the golden seed queries, and
  against `data/eval/golden.jsonl` once that file exists.

## Independence of the author

The session that wrote this set had not worked on the lexicon or the parsers, and did not
open `packages/core/src/parsing/**`, `packages/core/src/matching/**` or the parser
specification in `docs/BRIEF.md` 6. Expected status and expected SKUs were derived from
`data/catalog.csv`, `data/order_history.csv` and the attribute tables in
`docs/data-profile.md`, which describe the data rather than the implementation.

This is the mitigation docs/DESIGN.md 10.5 calls procedural: a set written by someone who
knows which abbreviations and synonyms are already covered reflects the implementation, not
a distributor's words.

## Changing the set

Any later change requires a dated note below saying what changed and why. Adding cases
after tuning has begun does not restore independence for those cases; mark them and report
them apart from the frozen 20.

| Date       | Change                         | Reason   |
| ---------- | ------------------------------ | -------- |
| 2026-09-18 | Frozen with 20 cases (PRG-32). | Initial. |
