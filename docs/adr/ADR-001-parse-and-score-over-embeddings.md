# ADR-001: Parse-and-score is the primary matcher, not embeddings

Status: Accepted
Date: 2026-09-21

## Context

The catalog is 1000 rows and 960 unique SKUs written in a closed grammar: diameter and
pitch, type, optional length, standard, material, finish. What separates one row from
another is numeric — M8 from M6, 5/8 from 5/16, 30 mm from 50 mm — and a rep's query
carries the same numbers in looser spelling (`SHCS`, `1/2"`, `12 millimeter`).

## Decision

Parse both sides into a structured specification, build the set of catalog items that
contradict nothing the query stated, and score inside that set. A lexical fallback
(BM25-lite over normalized description tokens, `docs/DESIGN.md` 5.8) answers text the
parser cannot read, and the same component run alone is the control this decision is
measured against.

## Alternatives considered

| Option                                                 | Why not                                                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embeddings-first, dense retrieval with optional rerank | Weak on numeric tokens, which are the only discriminant here; needs an API or a local model; scores are uncalibrated and harder to explain                        |
| BM25 only                                              | Misses M8 against M8-1.25, inch marks and `SHCS` without the same normalization work, and has no notion of a constraint. Kept as the fallback and as the baseline |
| LLM-only, "pick the top 3"                             | Non-deterministic, no eval loop, opaque confidence, latency and cost                                                                                              |

## Evidence

Both columns are the same 78 golden cases through the same loader and metrics
(`docs/eval-report.md`, Baseline comparison).

| metric          | parser | lexical baseline | cases |
| --------------- | ------ | ---------------- | ----- |
| Hit@1           | 1.000  | 0.167            | 48    |
| Hit@3           | 1.000  | 0.313            | 48    |
| MRR             | 1.000  | 0.268            | 48    |
| Set precision   | 1.000  | 0.118            | 30    |
| Exact-set rate  | 0.967  | 0.033            | 30    |
| Status accuracy | 0.987  | 0.603            | 78    |

The control is not handicapped. Its own `lexicalUniqueGap` was swept to the value that
maximizes its status accuracy, which raised it from 0.462 to 0.603
(`docs/calibration.md`), and its set recovery is scored on as many top hits as the labeled
answer holds — the size of the answer, given to it for free, since it has no compatible
set to cut. The remaining spread is therefore a floor on the difference, not a headline.

The parser side reads 960 of 960 unique SKUs: every row yields a diameter, type, material
and finish, every token is understood, and the SKU encoding is used as an independent
oracle (`packages/core/src/parsing/descriptionParser.catalog.test.ts`).

## Consequences

Explanations name the attribute that matched and the one that did not, because the
attributes are real objects rather than a similarity score. Latency is sub-millisecond
with no network dependency (ADR-004). The cost is the lexicon: a term the catalog uses and
the lexicon does not know becomes residue, and the two parser defects the golden set
catches today are of that kind — `nylon lock nut M8` is answered `ambiguous` where `none`
is expected, and `1/2"` never becomes a diameter.

Status accuracy is 0.987, not 1.000: one of the 78 cases is wrong — `same washers as last
time, but brass` (pers-21), where the override drops the standard. This record first read
0.962 over three failures; the other two were parser defects, since fixed. Every number
here is golden-set evidence; the held-out set has not been run.

## Revisit trigger

A catalog with long free-text descriptions where parser coverage drops below roughly 95%.
At that point embeddings earn their place as a retrieval stage in front of the parser,
with the numeric failure mode measured on the same sets first.
