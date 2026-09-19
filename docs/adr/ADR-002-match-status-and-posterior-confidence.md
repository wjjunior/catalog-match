# ADR-002: Match status is decided before confidence

Status: Accepted
Date: 2026-09-18

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

Status correctness over all 78 golden cases is 0.962 (`docs/eval-report.md`). The three
errors are `nylon lock nut M8` and `1/2"`, both parser defects, and one history-override
case; none is a confidence failure.

Calibration is measured on single-label cases only, because on a tie query "acceptable"
and "intended" are different events. All 29 such cases land in the top bin, 0.9 to 1.0,
at empirical top-1 precision 1.000.

**That is the whole of the precision evidence.** No single-label case lands below 0.9, so
the Medium and Low bands are ordered by the model and not validated against observed
frequency. The thresholds were therefore placed at gaps in the measured distribution:
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
