# Golden set rationale

## 1. What this file is

`data/eval/golden.jsonl` is the labeled evidence behind the evaluation claims in
`docs/DESIGN.md` 10.2: retrieval, set recovery, status correctness, constraint
preservation, personalization and calibration are each measured against these labels, not
asserted from confidence in the design. It holds 78 cases — 33 example queries (`ex-`), 21
personalized expectations (`pers-`) and 24 adversarial cases (`adv-`) — frozen on
2026-09-18, before any parameter tuning. A number that moves against this file is
evidence about the matcher; a number that moves this file is not.

## 2. How the labels were derived

Every `expected` set and `expectedTop1` label was produced by hand, using
`compatibleSet` in `scripts/expected-sets.ts` to filter `data/catalog.csv` directly — never
by running the matcher under evaluation. That script reuses only the throwaway CSV and
description parser written for `scripts/profile.ts` during data profiling, and imports
nothing from `packages/core`. This separation is deliberate: a label produced by the code
being evaluated would not be evidence about that code, it would be the code grading its
own homework.

Worked example, `M8 flat washer`:

- **Filter.** The query names a diameter and a type and nothing else:
  `{"diameter":"M8","types":["WASH"]}`.
- **Set.** `npx tsx scripts/expected-sets.ts --set '{"diameter":"M8","types":["WASH"]}'`
  returns the 7 active SKUs matching exactly that filter, sorted by SKU, plus one inactive
  SKU that the filter also matches but that is excluded from the compatible set because it
  is not active.
- **Row.** Those 7 SKUs become `ex-01`'s `expected` array with `expectedStatus:
"ambiguous"`. `pers-01` through `pers-05` reuse the identical 7-SKU set — the tie a
  customer profile is asked to break does not change — and are distinguished only by which
  member each customer's `expectedTop1` names.

## 3. The two fields that carry the answer

`expected` is always the active compatible set: the SKUs that satisfy every attribute the
query (and, for a history reference, the resolved referenced line) names, independent of
any ranking. `expectedTop1` is the one SKU the answer must rank first, present only where
an explicit attribute or a customer's history makes one item the intended one rather than
merely an acceptable one. A personalized tie query needs both fields together: `expected`
decides whether the status is correctly `ambiguous` and which items belong in it;
`expectedTop1` decides whether personalization moved the intended item to the front of
that same set.

## 4. Per-customer reasoning

**CUST-001, Midwest Industrial Supply** (18 lines, all STEEL, 14 ZINC) has the cleanest
profile in the file, and its labels follow the same pattern throughout: pick the STEEL
member of the tie set, and prefer a ZINC finish when more than one STEEL member exists.
`pers-01` picks the STEEL washer bought 2026-04-08; `pers-06` and `pers-09` pick the only
STEEL (respectively STEEL ZINC) item in their tie sets. `pers-11` is the strongest single
signal in the file: CUST-001 bought `PXNUT1216STZC0005` twice — the only repeat purchase
inside any M12 tie set — and it is also STEEL ZINC. `pers-16`, the history-reference case,
ranks CUST-001's three washer lines by recency and lands on the same SKU `pers-01` already
names.

**CUST-002, CleanRoom Pharma MFG** (17 lines, all 18-8 SS PLAIN, 4 repeat SKUs) has the
most repeat purchases of any customer, and its labels favor the 18-8 SS PLAIN tie member,
falling back to PLAIN alone where no 18-8 SS item exists. `pers-02` and `pers-07` pick the
only 18-8 SS PLAIN item in their sets, `pers-02` backed by a literal repeat purchase.
`pers-12` is the weakest label in the file for the opposite reason: no 18-8 SS item exists
among the M12 nuts, so only the PLAIN finish share can act, and `PXNUT122536PL0551` is
picked on finish alone. `pers-13` is the discontinued case: CUST-002's twice-bought
`PXNUT16888PL0901` is inactive, so the label falls to the one active stainless item,
`PXNUT1680A2HG0894`, under the half repeat weight `docs/DESIGN.md` 7.3 assigns to a
compatible item sharing a discontinued item's family. `pers-15` and `pers-21` turn on the
`standard` attribute specifically and are covered in Section 5.

**CUST-003, Marine Electrical Corp** (17 lines, all BRASS) has no dominant finish — HDG,
MECH ZINC, PLAIN, YELLOW ZINC and ZINC all appear in its history. `pers-03` picks
`PXWASH830BRZC0520`, the brass zinc washer bought 2025-12-20, over the set's other brass
washer because CUST-003 has more zinc-family lines than plain ones. `pers-18`, the
history-reference case, takes the most recent of four all-brass washer lines,
`PXWASHN8112BRPL0012` on 2026-03-30.

**CUST-004, Heavy Machinery Solutions** (18 lines, all ALLOY BLACK OXIDE) supplies the
labels where the intended material is absent from the tie set altogether. `pers-04` is the
case `docs/DESIGN.md` 7.5 calls a profile without a compatible material: no ALLOY M8 flat
washer exists, so only the BLACK OXIDE finish term can act, pointing to
`PXWASH816A2BO0624`. `pers-08` works on material as usual, because two alloy nuts do exist
in that tie set and finish separates them. `pers-14` is the override case: CUST-004's own
alloy black oxide 1/2-13 nut sits outside the compatible set once the query says brass
explicitly, so the label is the single brass nut and the explanation must show the
override rather than follow history. `pers-19`, the history-reference case, takes the most
recent of six all-alloy-black-oxide washer lines, `PXLOCK860ALBO0237` on 2026-04-25 — the
latest date in the entire history file.

**CUST-005, Summit General Maintenance** (6 lines, no dominant material) has the weakest
profile in the file, and its labels rely on a single earlier purchase rather than a
material or finish share. `pers-05` picks `PXWASH88088PL0688` — the same SKU CUST-002's
much stronger profile also names — on the strength of one purchase, 2025-11-30. `pers-20`,
the history-reference case, resolves cleanly even with only two washer lines in the whole
history.

## 5. Three deliberate readings

**The override in `pers-21` does not carry the referenced line's `standard`.** The
referenced line is `PXWASH88088PL0688`, an ISO 7380 item; the override takes its diameter,
type, length, material and finish as the base specification, then lets the query's
explicit `brass` overwrite the material. If the standard were carried across too, no brass
ISO 7380 M8 flat washer exists in the catalog and the query would return nothing. A
standard is a specification a previous order happened to satisfy, not a preference the
customer expressed, so it is not part of what "the same washer" means when the material is
being changed.

**`adv-07` (`M8 x 45mm shcs`) carries no `expectedAlternatives`.** The active M8 socket
head cap screws exist at 8, 16, 16, 20, 25, 30, 30 and 60 mm. The tolerance window around
45 mm is `[33.75, 56.25]` mm and is empty, and the nearest items — 30 mm and 60 mm — both
sit 15 mm away and tie. Recording either as the alternative would encode a tie-break rule
that does not yet exist as ground truth. This is a discrepancy with `docs/DESIGN.md` 6,
whose edge-case table predicts approximate-length alternatives for exactly this case; it is
recorded here so a later reader finds a deliberate reading, not an oversight.

**The four `status-only` rows (`adv-15`, `adv-18`, `adv-19`, `adv-20`) constrain a single
attribute and admit 86 to 192 catalog items.** `expected` is left empty and the rows are
tagged `status-only` rather than carrying a set that size. These rows measure status
correctness (does the matcher call `1/2"`, `washr`, `hex nutt` and `socket haed cap screw`
`ambiguous`, matching the corrected or resolved query) and constraint preservation, not set
recovery — recording hundreds of SKUs as a golden answer would test nothing that a smaller,
precise set could not.

## 6. Circularity, and what was done about it

`docs/DESIGN.md` 10.5 states the problem plainly:

> Personalized expectations are written by a person looking at the same history the
> algorithm uses; there is no independent ground truth for what a customer meant. The
> mitigation is procedural: expectations written before tuning, reasoning recorded,
> held-out cases untouched, and constraint preservation measured independently of any
> label.

That gives four mitigations already in place: the labels in this file were written before
any parameter in `packages/core/src/matching/config.ts` was tuned; the reasoning behind
every personalized label is recorded next to it in its `rationale` field; the held-out set
(`data/eval/heldout.jsonl`, PRG-32) stays untouched by this work; and constraint
preservation is measured independently of any label, by checking returned matches against
the query's own explicit attributes rather than against `expected`.

This card adds a fifth: derivation that never passes through the matcher. Every label here
came from `compatibleSet`'s filter over the catalog file and from the order-history lines
read directly, not from running the parser or profile builder under `packages/core`
evaluation. The evidence and the thing being evaluated do not share code.

## 7. Review

The line-by-line review of this file is a requirement of the merge, not of writing it.
`npx tsx scripts/expected-sets.ts --review` renders every row as a table of id, query,
customer, status, expected SKUs with their catalog descriptions, and top-1, specifically
so the owner can read all 78 rows against the order history and the catalog before
approving the PR.
