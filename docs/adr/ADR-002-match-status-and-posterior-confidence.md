# ADR-002: Match status is decided before confidence

Status: Accepted
Date: 2026-09-21

## Context

"Seven valid options" and "no valid option" are different answers, and both produce a low
score under any single similarity number. A rep needs them told apart before any number
is shown.

## Decision

Build the compatible set C — the items contradicting no attribute the query stated — and
derive the status from it (`unique`, `ambiguous`, `none`, `history`, `unparsed`) before
computing anything. Confidence is then the posterior of an explicit model over C plus a
null hypothesis "the intended product is not in this catalog", per `docs/DESIGN.md` 5.5.
A confidence threshold is never used to detect absence; the status is.

Measured values: epsilon 0.02, kappa 3, label thresholds High at 0.8 and Medium at 0.35.

## Alternatives considered

| Option                                             | Why not                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Soft penalties for contradictions inside one score | Lets weights or history rank a contradicting item above a compatible one, and lets many near-misses outweigh the null hypothesis. Not revisited |
| Null detection by a confidence threshold           | Cannot separate seven valid options from no valid option; both sit below any threshold. Not revisited                                           |

## Evidence

Status correctness over all 78 golden cases is 0.987 (`docs/eval-report.md`). The single
error is `same washers as last time, but brass` (pers-21), a history-override case; the two
parser defects this section once also counted have since been fixed. Neither then nor now
is any of them a confidence failure.

Calibration is measured on every case carrying an intended-SKU label whose answer the
posterior scored, 43 of them. History and unparsed answers stay out: their confidence is a
recency decay and a normalized overlap, and binning either against a posterior would measure
neither. Nine of the ten bins are populated, at empirical top-1 precision 1.000 throughout.

**That is the whole of the precision evidence, and outside the top bin it is thin.** An
earlier revision of this record read "all 29 such cases land in the top bin"; that described
a filter rather than the data, and the population was corrected to 43 on 2026-09-23
(`docs/calibration.md`). Cases do land below 0.9 — one to four per bin — which orders the
Medium and Low bands by the model without validating them against observed frequency. The
thresholds were placed at gaps in the measured distribution:
0.8 is the widest gap there is (0.706 to 0.845) and is exactly the line between a `unique`
answer and everything else, and 0.35 falls in the empty band between the wide ties and the
constrained answers (`docs/calibration.md`).

epsilon and kappa shape confidence without touching ranking: across 0 to 0.1, epsilon
moves the ceiling from 1.000 to 0.900 and leaves Hit@1, set recovery and status accuracy
unchanged. 0.02 reproduces the 0.98 that `docs/DESIGN.md` 5.5 works through.

## Consequences

The UI can say "7 options, specify material or finish" instead of showing seven items at
0.14 and hoping the rep infers the rest. `labels.provisional` is now false, so the label
reaches the API response; before calibration it was withheld on purpose.

A caller reading High as a calibrated probability would be overreading it on this
evidence. The README states the semantics and the bin count of 29.

## Revisit trigger

Acceptance data from a feedback loop (`docs/DESIGN.md` 13.1): with logged queries and the
SKU the rep accepted, epsilon, kappa and the thresholds are fitted rather than placed by
hand, and the bands below High acquire the evidence they lack here.
