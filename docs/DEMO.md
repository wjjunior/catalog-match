# Demo

The script of `docs/DESIGN.md` 14, as it is performed. Fourteen beats, about twelve minutes
with questions.

Two ways to run it. In the browser, `pnpm dev` and click the example chips — that is the
one to use on the call, because the status line, the chips and the personalization note are
half the argument. In the terminal, `pnpm run demo` prints the same fourteen beats through
the same core, which is what to use when screen sharing is unreliable and what
`scripts/demo.test.ts` holds to.

Warm the server before the call: the first request of a process loads both CSVs and builds
the index. Every one after that answers in under a millisecond.

## The arc

Three claims, in this order, because each one needs the last:

1. **A parser beats a retriever on this catalog** — beats 1 to 2.
2. **Status before confidence** — beats 2, 9, 10, 11.
3. **History as a prior that cannot override the query** — beats 3 to 8, 12, 13.

Then the numbers behind them, then the thing it gets wrong.

## Beats

**1. `1/4-20 x 3/4 hex cap screw zinc`** — every attribute agrees on one SKU. Status
`unique` and 98%. Say that the status was decided by the compatible set before any number
was computed; the number only ranks inside it.

**2. `M8 flat washer`, no customer** — seven compatible washers, all at 14%, and the status
line names what would settle it. This is the beat that kills the threshold approach: seven
valid options and no valid option both sit low on any score, so a number cannot tell them
apart. That is why `ambiguous` and `none` are different statuses.

**3. Select CUST-002, run it again** — the count stays 7. The 18-8 SS plain washer goes to
63% with `bought 2x, last 2026-04-15` on the card. Point at the unchanged count: history
reordered C, it did not change C.

**4. Select CUST-004, run it again** — no M8 flat washer is alloy, so the material term
drops out of the prior and only the finish share acts. A narrower margin, and the card says
the material could not be matched. Worth naming: the prior degrades instead of inventing.

**5. Select CUST-005, run it again** — six lines across four materials. The ranking stays
close to even. This is the sparse case working, not failing; if it separated, the shrinkage
would be broken. Expect the question "so what use is it" — the answer is that a near-uniform
prior is the honest output for a customer you know nothing about.

**6. `M8 flat washer DIN 912`, still CUST-002** — one washer. The ISO 7380 washer this
customer bought twice is outside C and cannot be ranked into it at any weight. The guarantee
is structural: personalization only ever sees C.

**7. `brass hex nut 1/2-13`, CUST-004** — brass only, for a customer who buys nothing but
alloy black oxide, and the card records the override rather than hiding it.

**8. `M16 hex nut`, CUST-002** — the M16 nut this customer bought is no longer active. It is
excluded from C, named in a note, and the stainless-family nuts inherit part of its weight.

**9. `M8 x 45mm SHCS`** — eight M8 socket head cap screws, none at 45 mm. Status `none`, the
failed constraint named in words, and the nearest lengths offered as alternatives carrying
closeness rather than confidence. Say why they carry no confidence: nothing here is the
thing that was asked for.

**10. `M14 hex nut`** — diameter and type are never relaxed, so there is nothing honest to
offer. A note and no alternatives. The contrast with beat 9 is the point.

**11. `the same washers as last time`, no customer** — the reference cannot be resolved, so
the answer is a prompt, not a guess.

**12. Select CUST-002, run it again** — the referenced orders themselves, most recent first,
with date and quantity as the explanation. There is no compatible set behind these.

**13. `same washers as last time, but brass`, CUST-002** — the referenced line becomes the
base specification, the query overwrites the material, and the merged specification runs the
normal pipeline.

**14. `square head set screw M6`** — the one it gets wrong, and the beat not to skip. See
below.

## The numbers

Open `docs/eval-report.md`, and `docs/eval-heldout.md` for the last of the three. In this
order:

- **The baseline comparison.** The same BM25-lite the parser falls back to, run alone over
  the same 78 golden cases: Hit@1 1.000 against 0.167, status accuracy 0.987 against 0.603.
  That table is the evidence for the parse-and-score choice, in place of the assertion.
- **Constraint preservation: 0**, with and without a customer, on both sets, and as a
  property test over generated queries. This is the one number that is not a label.
- **The held-out set.** Twenty cases frozen before tuning by a session that had not seen the
  parser, spent once. Hit@1 1.000, status accuracy 0.900.

If asked whether the confidence is calibrated, the answer is no, not really: 29 of 29
single-label golden cases land in the top bin, which supports High and says nothing about
Medium or Low. `docs/calibration.md` shows the thresholds being set from the shape of the
measured distribution and says so.

## The thing it gets wrong

`square head set screw M6` should be `none` — the catalog has no set screw — and it answers
`ambiguous` over 50 M6 items. This is held-out case HO-14, and the sibling HO-19
(`send the flat washers we had on the last order`, which should be `history`) is the same
defect in the other vocabulary.

Both are hand-enumerated lists: the type phrases the catalog does not stock, and the intent
phrases. Each covers what its author thought of and nothing beyond it.

**The fix is not to add the two phrases.** That would spend the held-out evidence to make
the number look better and leave the class of defect exactly where it was. The real fix is
the one `docs/DESIGN.md` 13 already names: structured extraction for queries that end mostly
as residue, measured against these same two sets before it is switched on. Offer that the
residue is already the signal — the parser knows it did not understand `square head set
screw`, it just has no way to conclude that the catalog therefore has none.

## Rehearsal checklist

Run this end to end before the call, timed.

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm test` clean.
- [ ] `pnpm run eval` regenerates `docs/eval-report.md` with no diff but the p95 line, which
      moves between runs. It leaves `docs/eval-heldout.md` alone; that set is spent.
- [ ] `pnpm run demo` prints all fourteen beats.
- [ ] `pnpm dev`, then one query sent to warm the process.
- [ ] Beats 1 to 14 in the browser, from the chips where a chip exists.
- [ ] The customer combobox cleared between beats 8 and 9, or beat 9 answers for CUST-002.
- [ ] `docs/eval-report.md` and `docs/eval-heldout.md` open in a second tab for the numbers.
- [ ] Under twelve minutes without questions.

Two failure modes to have an answer ready for: port 3000 taken
(`pnpm --filter @catalog-match/web dev -p 3001`), and a cold first request looking slow
(`docs/RUNBOOK.md`).
