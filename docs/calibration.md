# Calibration

The single session in which parameter values are allowed to change (PRG-36). Run on
2026-09-18 against `data/eval/golden.jsonl`, 78 cases. Every sweep below moves one
parameter and holds the rest at their a priori values; every number is the golden set,
measured through `packages/core/src/eval`.

Three values moved. Every other parameter stayed where the design put it, because the
sweep showed a plateau rather than a peak — recorded here so that "unchanged" is a
measurement and not an omission.

| parameter            | before | after |
| -------------------- | ------ | ----- |
| `alpha`              | 0.5    | 1     |
| `labels.high`        | 0.7    | 0.8   |
| `labels.provisional` | true   | false |
| `lexicalUniqueGap`   | 0.1    | 0.01  |

| golden metric                       | before | after |
| ----------------------------------- | ------ | ----- |
| Hit@1 (48 cases)                    | 0.979  | 1.000 |
| MRR (48 cases)                      | 0.990  | 1.000 |
| Set precision (30 cases)            | 1.000  | 1.000 |
| Exact-set rate (30 cases)           | 0.967  | 0.967 |
| Status accuracy (78 cases)          | 0.962  | 0.962 |
| Constraint violations (78 cases)    | 0      | 0     |
| Personalization Hit@1 (21 cases)    | 0.952  | 1.000 |
| Personalization margin (18 cases)   | 0.359  | 0.328 |
| Baseline status accuracy (78 cases) | 0.462  | 0.603 |

## Sweeps

Each table carries the metrics its parameter actually moves. Set precision, exact-set
rate and constraint violations are absent from every one of them because they did not
change anywhere in any range swept: 1.000, 0.967 and 0 throughout.

### `alpha` 0.5 → 1

Smoothing on the per-attribute shares. At 0.5 the six-line profile of CUST-005 was
confident enough about material to rank a brass washer above `PXWASH88088PL0688`, the
washer that customer actually bought. Add-one smoothing flattens a sparse profile, and
the repeat term then carries the purchased SKU.

| alpha | Hit@1     | Pers. Hit@1 | Margin    | CUST-005 top-1        | CUST-005 q range |
| ----- | --------- | ----------- | --------- | --------------------- | ---------------- |
| 0.5   | 0.979     | 0.952       | 0.359     | PXWASH830BRZC0520     | 0.188–0.105      |
| 0.7   | 0.979     | 0.952       | 0.345     | PXWASH830BRZC0520     | 0.178–0.110      |
| 0.75  | 1.000     | 1.000       | 0.342     | PXWASH88088PL0688     | 0.178–0.110      |
| 0.9   | 1.000     | 1.000       | 0.333     | PXWASH88088PL0688     | 0.178–0.113      |
| **1** | **1.000** | **1.000**   | **0.328** | **PXWASH88088PL0688** | **0.178–0.114**  |
| 1.5   | 1.000     | 1.000       | 0.306     | PXWASH88088PL0688     | 0.178–0.119      |
| 2     | 1.000     | 1.000       | 0.288     | PXWASH88088PL0688     | 0.178–0.123      |

The behaviour changes between 0.7 and 0.75 and then holds to 2, so 1 sits inside the
plateau instead of on its edge, and it is the standard add-one value rather than a number
fitted to this set. The cost is the mean margin, which falls monotonically with more
smoothing: 0.328 against 0.359.

This is the one change that fixes a failing case, so it deserves the sharpest question:
is it tuned to the label? DESIGN 7.5 asks two things of CUST-005 — that the prior stay
close to uniform, and that no item separate from the rest. Both still hold at alpha 1
(the range narrows from 0.188–0.105 to 0.178–0.114, and the winning margin is 0.009).
The golden label asks that the single earlier purchase carry the answer. Before, those
two readings contradicted each other; after, both are satisfied at once.

### `epsilon` — unchanged at 0.02

Ranking is untouched across the whole range; epsilon shapes confidence only, as
DESIGN 5.5 says it should.

| epsilon  | Hit@1     | Status    | ≥0.9   | max confidence |
| -------- | --------- | --------- | ------ | -------------- |
| 0        | 0.979     | 0.962     | 30     | 1.000          |
| 0.01     | 0.979     | 0.962     | 30     | 0.990          |
| **0.02** | **0.979** | **0.962** | **29** | **0.980**      |
| 0.05     | 0.979     | 0.962     | 28     | 0.950          |
| 0.1      | 0.979     | 0.962     | 28     | 0.900          |

Kept at 0.02: it reproduces the "p near 0.98" of DESIGN 5.5 exactly, and nothing in the
measurement argues for another value.

### `kappa` — unchanged at 3

| kappa | Hit@1     | Status    | Pers. Hit@1 | Margin    | ≥0.9   |
| ----- | --------- | --------- | ----------- | --------- | ------ |
| 1     | 0.979     | 0.962     | 0.952       | 0.359     | 30     |
| 2     | 0.979     | 0.962     | 0.952       | 0.359     | 30     |
| **3** | **0.979** | **0.962** | **0.952**   | **0.359** | **29** |
| 4     | 0.979     | 0.962     | 0.952       | 0.359     | 29     |
| 6     | 0.979     | 0.962     | 0.952       | 0.359     | 28     |

Flat on everything except the top confidence bin, and that only by one case. No evidence
to move it.

### `k` — unchanged at 5

| k     | Hit@1     | Pers. Hit@1 | Margin    |
| ----- | --------- | ----------- | --------- |
| 2     | 0.979     | 0.952       | 0.447     |
| 3     | 0.979     | 0.952       | 0.413     |
| **5** | **0.979** | **0.952**   | **0.359** |
| 8     | 0.979     | 0.952       | 0.302     |
| 12    | 0.979     | 0.952       | 0.251     |

Shrinkage moves the margin and nothing else: no case changes its answer anywhere in the
range. A smaller k buys a wider margin by letting a thin profile speak louder, which is
the opposite of what DESIGN 7.5 asks for CUST-005. Kept at 5.

### `familyCredit` — unchanged at 0.8

| familyCredit | 0.5       | 0.65      | **0.8**   | 0.9       | 1         |
| ------------ | --------- | --------- | --------- | --------- | --------- |
| every metric | identical | identical | identical | identical | identical |

No case on this set turns on family credit. The golden set gives no evidence either way,
so the a priori value stands; this is a gap in the set, not a settled question.

### `wSku` — unchanged at 2

| wSku  | Hit@1     | MRR       | Pers. Hit@1 | Margin    |
| ----- | --------- | --------- | ----------- | --------- |
| 1     | 0.979     | 0.986     | 0.952       | 0.344     |
| **2** | **0.979** | **0.990** | **0.952**   | **0.359** |
| 3     | 1.000     | 1.000     | 1.000       | 0.369     |
| 5     | 1.000     | 1.000     | 1.000       | 0.385     |

Raising `wSku` to 3 fixes the same case `alpha` does, and this is where the session had
to choose between two knobs that move one case. The defect is a sparse profile being
overconfident, so the fix belongs in the smoothing that exists for sparsity; `wSku` would
have paid for it by shouting louder about repeat purchases for every customer, including
the ones whose profiles were already right. Kept at 2.

### `siblingCredit` — unchanged at 0.5

| siblingCredit | 0.25  | **0.5**   | 0.75  |
| ------------- | ----- | --------- | ----- |
| Margin        | 0.356 | **0.359** | 0.361 |

Everything else identical. Nothing to choose between them; kept.

### `lexicalUniqueGap` 0.1 → 0.01

How far the runner-up must trail before the lexical baseline calls a query unique. This
parameter belongs to the control, not to the system under test, so the honest target is
the baseline's own best score: a handicapped control flatters the comparison it exists to
resist.

| gap          | baseline status accuracy |
| ------------ | ------------------------ |
| 0            | 0.372                    |
| 0.005        | 0.603                    |
| **0.01**     | **0.603**                |
| 0.02         | 0.603                    |
| 0.03         | 0.590                    |
| 0.05         | 0.500                    |
| 0.1 (before) | 0.462                    |
| 0.3          | 0.385                    |

0.01 sits in the middle of the 0.005–0.02 plateau. The baseline gains 0.141 of status
accuracy from this, all of it against us.

## Label thresholds

`labels.high` 0.7 → 0.8, `labels.medium` unchanged at 0.35, `provisional` → false. While
`provisional` was true the label never reached the response at all
(`application/matchQuery.ts`), so this flip is what makes the band visible to a caller.

The calibration table the harness prints is degenerate by construction: it scores only
single-label cases, and all 29 of them land in the top bin at precision 1.000. It
supports the top band and says nothing about any other. The thresholds were therefore set
from the shape of the measured distribution, in 0.05 bins over the 69 answers that carry
a top-1 confidence:

| band      | cases | statuses present           |
| --------- | ----- | -------------------------- |
| 0.00–0.30 | 21    | ambiguous                  |
| 0.35–0.50 | 5     | ambiguous, unparsed        |
| 0.55–0.75 | 13    | ambiguous (8), history (5) |
| 0.80–1.00 | 30    | unique                     |

The five widest gaps in the sorted confidences are 0.706→0.845 (0.139), 0.845→0.942
(0.097), 0.012→0.109 (0.097), 0.278→0.369 (0.092) and 0.490→0.572 (0.082).

- **High at 0.8.** The widest gap in the distribution, and it is exactly the line between
  a `unique` answer and everything else: every one of the 30 unique answers is at or
  above 0.845, and nothing else reaches 0.8. At the old 0.7 the five `history` answers
  sitting at 0.70–0.75 were called High, which promised attribute confidence the answer
  never had.
- **Medium at 0.35.** Falls in the 0.278→0.369 gap, separating the wide ties (the
  seven-way washer queries, around 0.14) from the answers with real constraints on them.
- **Low** is everything below, which on this set is the ties.

**What this does not establish.** Empirical precision is measured in the top band only,
where 29 of 29 were right. The Medium and Low bands are ordered by the model, not
validated against frequency: no single-label case lands there, so there is no observed
precision to compare them against. The README limitation paragraph should say so, and
should quote the bin count of 29 rather than a rate alone.

## Posteriors for the three `M8 flat washer` customers

Required by PRG-36 scope item 5. `q` is the prior over the compatible set of seven.

| customer | top-1             | q range before | q range after | margin after | DESIGN 7.5 expectation                    |
| -------- | ----------------- | -------------- | ------------- | ------------ | ----------------------------------------- |
| CUST-002 | PXWASH88088PL0688 | 0.663–0.054    | 0.645–0.056   | 0.559        | clear margin — met                        |
| CUST-004 | PXWASH816A2BO0624 | 0.544–0.076    | 0.457–0.090   | 0.360        | small margin, material unmatched — met    |
| CUST-005 | PXWASH88088PL0688 | 0.188–0.105    | 0.178–0.114   | 0.009        | close to uniform, nothing separates — met |

CUST-005 is the case DESIGN 7.5 quotes numerically as "q from 0.188 to 0.105". That range
was measured against `alpha` 0.5 and is now 0.178–0.114. The prose expectation still
holds; the two figures are stale and belong to the final pass over DESIGN (PRG-39).

## What tuning could not fix

Four golden cases fail, and no parameter value reaches any of them. They were left alone
rather than tuned around, and none of them is a wrong expectation that this card may
quietly rewrite.

| case      | query                                  | expected  | actual               | why it is not a parameter                                                                                                                                                                                                                |
| --------- | -------------------------------------- | --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adv-06`  | `nylon lock nut M8`                    | none      | ambiguous            | "lock nut" is never rejected as a type the catalog lacks; lexicon                                                                                                                                                                        |
| `adv-15`  | `1/2"`                                 | ambiguous | unparsed             | the bare inch mark never becomes a diameter; units                                                                                                                                                                                       |
| `pers-21` | `same washers as last time, but brass` | 2 results | 1 result             | DESIGN 7.4 does not say which base attributes survive an override: read literally it carries the standard and the finish and returns nothing, the implementation drops the standard and keeps the finish, the label expects both dropped |
| `pers-05` | `M8 flat washer` / CUST-005            | rank 1    | **fixed by `alpha`** | was the label against DESIGN 7.5; both now hold                                                                                                                                                                                          |

## Held-out set

Not run. `data/eval/heldout.jsonl` may be spent once, and spending it here would measure a
matcher with the three known defects above still in it. It is deferred to its own card, to
be run after they are resolved and before the demo, with the date recorded in the report.
No parameter may move after that run.
