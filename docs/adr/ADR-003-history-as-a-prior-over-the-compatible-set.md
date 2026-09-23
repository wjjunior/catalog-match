# ADR-003: Personalization is a prior over the compatible set

Status: Accepted
Date: 2026-09-21

## Context

Five customers, 76 history lines. Two of them buy almost one thing (CUST-002 is 17 of 17
lines 18-8 stainless, plain), one has a six-line history with no dominant material. A rep
asking for `M8 flat washer` on behalf of a customer who always buys the same washer should
see that washer first, and must never see it when the query rules it out.

## Decision

Turn the customer's history into a distribution over attribute values, shrink it toward
uniform by how much history there is, and apply it as the prior q over C — only through
attributes the query left unspecified. Because the prior only ever sees C, an explicit
attribute wins by construction rather than by a rule.

Measured values: tau 180 days measured from the latest date in the file and never the wall
clock, k 5, alpha 1, w_sku 2, sibling credit 0.5.

## Alternatives considered

| Option                                       | Why not                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Additive history boost with tunable weights  | Its maximum boost is bounded by the weights, so a promised label can be unreachable, and it has no probabilistic reading. Not revisited |
| Embedding centroid or co-purchase statistics | 76 history lines; attribute-level shares are transparent and explainable at this size                                                   |

## Evidence

Over the 21 personalized golden cases (`docs/eval-report.md`): Hit@1 1.000 with the
customer against 0.143 without, and a mean top-1 to top-2 margin of 0.328 over the 18 cases
that return a second result.

Across all 78 cases, with and without a customer, **zero returned matches contradict an
attribute the query stated**. That number is measured against the catalog row and the
query's own provenance rather than by asking the matcher whether it agrees with itself.
It is the evidence for "by construction": the prior cannot promote a contradicting item
because it never sees one.

The three `M8 flat washer` customers behave as `docs/DESIGN.md` 7.5 describes — a clear
margin for CUST-002 (0.559), a small one for CUST-004 (0.360), and for the sparse CUST-005
a prior that stays close to uniform, 0.178 to 0.114, with the once-purchased SKU leading by
0.009.

alpha is 1 and not the 0.5 stated in `docs/BRIEF.md` 8. At 0.5 the six-line profile was
confident enough about material to rank a brass washer above the washer that customer had
actually bought; the sweep and the reasoning are in `docs/calibration.md`.

## Consequences

Personalization is explainable in one sentence to a rep — "bought 2x, last 2026-04-15" —
and cannot be blamed for a wrong item that the query excluded. Shrinkage means a thin
history moves little, which is deliberate: CUST-005's answer is nearly uniform by design,
not by accident.

One golden case remains wrong, a history reference with an override; `docs/DESIGN.md` 7.4
does not say which attributes of the referenced order survive, and no parameter value
reaches it. Every number here is golden-set evidence; the held-out set, spent once on
2026-09-21, is reported separately in `docs/eval-heldout.md`.

## Revisit trigger

A history large enough to estimate item-to-item statistics, where co-purchase or embedding
approaches have data to stand on.
