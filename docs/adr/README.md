# Architecture Decision Records

One file per decision, `ADR-<number>-<slug>.md`, each stating the context, the decision,
the alternatives considered and the consequences. Numbers are never reused; a decision
that is replaced is superseded by a new record rather than edited.

The five records below are specified in `docs/BRIEF.md` section 3 and are written by
PRG-38 once the calibration of PRG-36 has produced the measured values they cite.

| ADR     | Decision                                                          |
| ------- | ----------------------------------------------------------------- |
| ADR-001 | Parse-and-score is the primary matcher, not embeddings.           |
| ADR-002 | Match status is decided before confidence.                        |
| ADR-003 | Personalization is a prior distribution over the compatible set.  |
| ADR-004 | No database: in-memory repositories loaded from CSV behind ports. |
| ADR-005 | No LLM in the matching path.                                      |
