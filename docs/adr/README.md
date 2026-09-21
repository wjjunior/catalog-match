# Architecture Decision Records

One file per decision, `ADR-<number>-<slug>.md`, each stating the context, the decision,
the alternatives considered and the consequences. Numbers are never reused; a decision
that is replaced is superseded by a new record rather than edited.

Every number in these records is measured, and cites `docs/eval-report.md` or
`docs/calibration.md` for where it comes from. All of it is golden-set evidence: the
held-out set has not been run.

| ADR                                                              | Decision                                               | Status   | Date       |
| ---------------------------------------------------------------- | ------------------------------------------------------ | -------- | ---------- |
| [ADR-001](ADR-001-parse-and-score-over-embeddings.md)            | Parse-and-score is the primary matcher, not embeddings | Accepted | 2026-09-21 |
| [ADR-002](ADR-002-match-status-and-posterior-confidence.md)      | Match status is decided before confidence              | Accepted | 2026-09-21 |
| [ADR-003](ADR-003-history-as-a-prior-over-the-compatible-set.md) | Personalization is a prior over the compatible set     | Accepted | 2026-09-21 |
| [ADR-004](ADR-004-in-memory-data-layer.md)                       | No database, in-memory repositories behind ports       | Accepted | 2026-09-21 |
| [ADR-005](ADR-005-no-runtime-llm.md)                             | No LLM in the matching path                            | Accepted | 2026-09-21 |
