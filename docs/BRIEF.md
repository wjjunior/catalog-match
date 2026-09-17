# Catalog Match: Engineering Brief

Addressed to: Claude Code. Read this file fully before writing any code. The data findings in section 2 were verified against the real files and are the ground truth for every design decision below. Work in phases (section 13) and stop at each checkpoint.

## 1. Context and what is being evaluated

- Take-home for Paragon (AI order entry and quoting for industrial distributors). This task mirrors their core product: mapping a free-text PO/RFQ line to a catalog SKU.
- Evaluation criteria, in order: a defensible matching approach; clean separation between UI, matching logic and data layer; explicit edge-case handling; ability to defend every choice in a live discussion; mature use of coding agents.
- Priority: a clean base challenge first. The stretch (order-history personalization) only after the base is solid and measured.
- Runs locally. Must demo live on a call. The whole pipeline is deterministic and offline: no network calls, no API keys, no environment variables.

## 2. Data findings (verified)

### catalog.csv

Columns: `catalog_id`, `sku`, `catalog_description`, `active` (Y/N). 1000 rows, 960 unique SKUs (40 rows are exact duplicates: same SKU, description and active flag, different `catalog_id`), 45 inactive rows (44 unique inactive SKUs; one inactive SKU is among the duplicates).

Every description follows one grammar:

```
<diameter>[-<pitch>] [X <length><unit>] <type phrase> [<standard>] <material> <finish>
```

- Diameters (16). Imperial: 1/4, 5/16, 3/8, 7/16, 1/2, 5/8, 3/4. Metric: M4, M5, M6, M8, M10, M12, M16. Numbered: #8, #10. Each diameter appears with exactly one pitch/TPI: 1/4-20, 5/16-18, 3/8-16, 7/16-14, 1/2-13, 5/8-11, 3/4-10, M4-0.7, M5-0.8, M6-1.0, M8-1.25, M10-1.5, M12-1.75, M16-2.0, #8-32, #10-24. Pitch is therefore redundant with diameter in this catalog. One row omits it: `5/16 FLAT WASHER STEEL PLAIN`.
- Length: present on 100% of screws, bolts and rods, absent on 100% of nuts and washers. Units: `"` for inches (once omitted: `3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG`), `FT`, `MM`. Forms: `3/4`, `1-1/2` (mixed number), `2-1/2`, `6FT`, `30MM`. Separator: ` X `, `X`, `x`, with or without spaces (`1/2-13x3"`).
- Product types (10) and the abbreviation variants that occur in the catalog:
  - hex_cap_screw: HEX CAP SCREW, HX CAP SCREW, HEX CAP SCR, HX CAP SCR
  - socket_head_cap_screw: SOCKET HEAD CAP SCREW, SOCKET HEAD CAP SCR, SOC HEAD CAP SCREW, SOC HEAD CAP SCR
  - button_socket_cap_screw: BUTTON SOCKET CAP SCREW, BUTTON SOC CAP SCREW, BTN SOCKET CAP SCREW, BTN SOC CAP SCREW, and the SCR variants of each
  - pan_machine_screw: PHILLIPS PAN MACHINE SCREW, PHILLIPS PAN MACH SCREW, PHIL PAN MACHINE SCREW, PHIL PAN MACH SCREW, and the SCR variants
  - lag_screw: LAG SCREW, LAG SCR, HX HD LAG SCR
  - tap_bolt: TAP BOLT
  - threaded_rod: THREADED ROD, FULL THREAD ROD
  - hex_nut: HEX NUT, HX NUT
  - flat_washer: FLAT WASHER, FLAT WSHR
  - lock_washer: LOCK WASHER, LOCK WSHR
- Materials (6): STEEL, 18-8 SS, 316 SS, A2 SS, BRASS, ALLOY. Finishes (6): ZINC (also ZN), YELLOW ZINC (also YEL ZINC, YELLOW ZN), MECH ZINC (also MECH ZN), HDG, PLAIN (also PLN), BLACK OXIDE. All 36 material x finish combinations exist.
- Standards (7), present on about 78% of rows: ASME B18.2.1, DIN 912, DIN 933, ISO 7380, IFI 111, ASTM A307, CLASS 8 (once). They are assigned independently of product type (DIN 912 appears on washers, ISO 7380 on nuts). Treat standard as an opaque low-weight attribute. Never infer type from standard.
- Casing: 74 rows are fully lowercase. Whitespace is irregular.
- SKU structure: `PX<TYPE><digits><MAT><FIN><seq>` with TYPE in {HEX, SOC, BTN, PAN, LAG, TAP, ROD, NUT, WASH, LOCK}, MAT in {ST, 88, 36, A2, BR, AL}, FIN in {ZC, YZ, MZ, HG, PL, BO}. Use it only as a test oracle for the description parser (assert agreement on type, material and finish for all 960 SKUs). The description is the source of truth: the challenge states the catalog is descriptions only.
- Uniqueness: the tuple (diameter, length, type, material, finish, standard) identifies each of the 960 SKUs. Without standard, 950 tuples remain distinct: 10 pairs differ only by standard (example: `M16-2.0 HEX NUT STEEL ZINC` vs `M16-2.0 HEX NUT DIN 933 STEEL ZINC`). Among items with a length, (diameter, type, length) is unique for 654 of 668 groups; the 14 exceptions have exactly 2 members.

### order_history.csv

Columns: `customer_id`, `customer_name`, `order_date`, `sku`, `catalog_description`, `quantity`. 76 lines, 5 customers, 2025-07-20 to 2026-04-25. Every SKU exists in the catalog. One history SKU is inactive: `PXNUT16888PL0901` (M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN, CUST-002, 2025-12-02).

Customer profiles:

| Customer | Lines | Material | Finish | Notes |
|---|---|---|---|---|
| CUST-001 Midwest Industrial Supply | 18 | STEEL 100% | ZINC majority, some YELLOW ZINC, MECH ZINC, HDG | repeat SKU: M12 hex nut |
| CUST-002 CleanRoom Pharma MFG | 17 | 18-8 SS 100% | PLAIN 100% | 4 repeat SKUs; one bought SKU is now inactive |
| CUST-003 Marine Electrical Corp | 17 | BRASS 100% | mixed (MECH ZINC, HDG, ZINC, PLAIN, YELLOW ZINC) | repeat SKU: M5 threaded rod |
| CUST-004 Heavy Machinery Solutions | 18 | ALLOY 100% | BLACK OXIDE 100% | repeat SKU: 5/8 lock washer |
| CUST-005 Summit General Maintenance | 6 | 4 different materials | 4 different finishes | no repeat SKU; sparse and conflicting: the built-in edge case |

### Example queries (33, from EXAMPLE_QUERIES.pdf)

- 22 of 33 resolve to exactly one SKU once diameter, type and length are parsed, regardless of material and finish.
- 10 are nut or washer queries with diameter and type only: 2 to 9 candidates that differ only in material, finish and standard. Examples: `M8 flat washer` (8 candidates, 1 inactive), `M12 hex nut` (9), `5/16-18 flat washer` (9), `M4 hex nut` (2).
- 1 (`the same washers as last time`) carries no attributes and can only be answered from history.
- Forms that must parse: `SHCS`, `BHCS`, `HHB`, `hex bolt`, `button socket`, `rod`, `pan head`, `1/2 inch`, `6 foot`, plural `nuts`, trailing length without X (`tap bolt 5/8`, `machine screw 1-1/4`), attribute order permutations (`brass hex nut 1/2-13`, `lock washer 5/8`), `#8-32`, `#10-24`.
- `M8 flat washer` is the personalization showcase: CUST-001 bought `PXWASH825STYZ0009` (steel yellow zinc), CUST-002 and CUST-005 bought `PXWASH88088PL0688` (18-8 SS plain), CUST-003 bought `PXWASH830BRZC0520` (brass zinc), CUST-004 never bought one and no ALLOY M8 flat washer exists, so the finish prior (BLACK OXIDE) should surface `PXWASH816A2BO0624` (A2 SS black oxide) with an explanation that material could not be matched.

## 3. Decisions (write each as an ADR under docs/adr/)

- ADR-001 Parse-and-score is the primary matcher, not embeddings. The catalog language is a closed grammar and the discriminating information is numeric (M8 vs M6, 5/8 vs 5/16, 30mm vs 50mm). Dense embeddings are unreliable on numeric tokens; BM25 alone misses `M8` vs `M8-1.25`, `inch`, `SHCS`. A deterministic parser recovers structured attributes for 100% of this catalog, gives exact explanations, sub-millisecond latency, no API dependency, and is unit-testable. Keep a lexical fallback for unparsed residue. Embeddings are documented as the next step for a messier real catalog, with the numeric failure mode named.
- ADR-002 Match status before confidence. The compatible set C (items contradicting no specified attribute) and the status (unique, ambiguous, none, history, unparsed) are decided before any number. Confidence is the posterior of a small explicit model over C plus a "not in catalog" hypothesis; its semantics are stated, its calibration is measured on single-label cases only, and the High/Medium/Low thresholds are attached after that measurement (section 7). A confidence threshold is never used to detect "not in catalog"; the status is.
- ADR-003 Personalization is a prior distribution over C (a mixture of a history-derived distribution and the uniform one, weighted by shrinkage), applied only through attributes the query leaves unspecified. Because it only sees C, an explicit attribute wins by construction, not by a rule (section 8).
- ADR-004 No database. In-memory repositories loaded from CSV behind interfaces; the README shows where Postgres/pgvector would slot in. 960 items do not justify infrastructure.
- ADR-005 No LLM in the matching path. Considered and deferred: an `LlmQueryInterpreter` for queries the deterministic parser cannot cover, and LLM-generated document expansion (doc2query style) for messier real catalogs. On this catalog the parser reaches 100% coverage and every example query is attribute-shaped, so a runtime LLM would add non-determinism, latency, cost and an untestable code path without measurable gain. Typos are handled deterministically (section 6, fuzzy matching). Record the trigger for revisiting: the eval shows a residue-heavy query class the lexicon cannot absorb, or a catalog where the parser drops below roughly 95% coverage. AI is used in the development process (this brief, the golden set, the lexicon seed, the code), not at runtime; the README states this and points to this ADR.

## 4. Repository layout and architecture style

pnpm workspace, TypeScript strict, Node 20+, vitest (fast-check available), ESLint with eslint-plugin-boundaries (dependency-cruiser is an acceptable alternative), Prettier.

Architecture: hexagonal core, FSD-lite web, both enforced by lint rather than by folder convention. Core inner ring = `domain/` (types, contracts, config), `parsing/`, `matching/`, `personalization/`: pure functions, no framework, no I/O. `ports/` holds exactly three ports: `CatalogRepository`, `OrderHistoryRepository` (driven) and `Matcher` (driving, implemented by the `matchQuery` use case). Parser and prior interfaces are inner-ring contracts (`domain/contracts.ts`), not ports. `application/` holds the use cases as functions and the single composition root `createCore`. `adapters/csv` and `adapters/memory` are the driven adapters. Route handlers, eval harness, demo script and property tests are driving adapters over the same port.

```
packages/core/src
  domain/            types and tables, contracts.ts (DescriptionParser, QueryParser, HistoryPrior), domain.test.ts
  parsing/           normalize.ts, units.ts, lexicon.ts, fuzzy.ts, descriptionParser.ts, queryParser.ts
  matching/          compatibility.ts (set C, status, backoff), ranking.ts, posterior.ts, explainer.ts, lexicalFallback.ts, config.ts
  personalization/   customerProfile.ts, historyPrior.ts, intent.ts, historyReference.ts
  ports/             catalogRepository.ts, orderHistoryRepository.ts, matcher.ts
  application/       matchQuery.ts (implements Matcher), listCustomers.ts, createCore.ts (composition root; the only module importing adapters)
  adapters/csv/      csv.ts, csvCatalogRepository.ts, csvOrderHistoryRepository.ts
  adapters/memory/   inMemoryCatalogRepository.ts, inMemoryOrderHistoryRepository.ts (test doubles, generators)
  eval/              loader, metrics, baseline runner, report (receives a Matcher; never imports adapters)
  index.ts           public API: createCore, createCoreFromRepositories, ports, types, config, adapters, parsers
apps/web
  app/               page.tsx (composes the widget); api/match/route.ts, api/customers/route.ts (driving adapters)
  server/core.ts     createCore({ dataDir }) once per process; stub injection for tests; the only place importing core runtime
  src/widgets/results-panel
  src/features/match-query, src/features/select-customer
  src/entities/match, src/entities/customer
  src/shared/api (client, schema, example queries), src/shared/ui
data/                catalog.csv, order_history.csv, eval/golden.jsonl, eval/heldout.jsonl
docs/                DESIGN.md, BRIEF.md, adr/, eval-report.md, ASSUMPTIONS.md, DEMO.md, RUNBOOK.md
scripts/             profile.ts, eval.ts, demo.ts
```

Import boundaries (lint, part of `pnpm lint`): inner ring imports inner ring only; ports import the inner ring; application imports inner ring and ports; adapters import ports and the inner ring, never application; eval imports application, ports and the inner ring, never adapters. Web: `app/` imports widgets, features, entities, shared and server; `server/` imports the core public API only; widgets import features, entities, shared; features import entities, shared; entities import shared; shared imports nothing internal; `src/**` imports core types only, never core runtime.

Rules that keep the hexagon honest: a port exists only with two adapters or one adapter plus a test double in use; use cases return plain objects; no DTO or mapper layer (domain types are the wire types, one zod schema at the HTTP edge); no DI container; no domain events, CQRS or generic repository. FSD-lite: a slice with a single file has no `index.ts`; no client-side matching logic.

## 5. Domain model

```ts
type ThreadSystem = 'metric' | 'imperial' | 'number';
interface Diameter { system: ThreadSystem; nominal: string; /* 'M8' | '1/2' | '#8' */ mm: number; known: boolean }
interface Length { value: number; unit: 'in' | 'mm' | 'ft'; mm: number }
type ProductType = 'hex_cap_screw' | 'socket_head_cap_screw' | 'button_socket_cap_screw' | 'pan_machine_screw'
  | 'lag_screw' | 'tap_bolt' | 'threaded_rod' | 'hex_nut' | 'flat_washer' | 'lock_washer';
type Material = 'steel' | 'ss_18_8' | 'ss_316' | 'ss_a2' | 'brass' | 'alloy';
type MaterialFamily = 'stainless' | 'steel' | 'brass' | 'alloy';
type Finish = 'zinc' | 'yellow_zinc' | 'mech_zinc' | 'hdg' | 'plain' | 'black_oxide';
type FinishFamily = 'zinc_family' | 'hdg' | 'plain' | 'black_oxide';

interface ParsedSpec {
  diameter?: Diameter; pitch?: string; length?: Length;
  type?: { value: ProductType; strength: number }[];      // several entries when a term is ambiguous ("bolt", "washer")
  material?: { value: Material | MaterialFamily; strength: number };
  finish?: { value: Finish | FinishFamily; strength: number };
  standard?: string;
  residue: string[];                                       // tokens not understood
  evidence: Partial<Record<keyof ParsedSpec, string>>;     // source span per attribute, for the UI
  provenance: Partial<Record<keyof ParsedSpec, 'explicit' | 'inferred' | 'corrected' | 'approximate' | 'unrecognized'>>;
}

type MatchStatus = 'unique' | 'ambiguous' | 'none' | 'history' | 'unparsed';
```

Family rules: stainless = {ss_18_8, ss_316, ss_a2}; a query saying "stainless", "ss" or "inox" matches the family (partial credit). "304" maps to ss_18_8, "a4" to ss_316. A2 is a sibling of 18-8, not equal to it. zinc_family = {zinc, yellow_zinc, mech_zinc}.

## 6. Parser specification

### Normalization (shared by catalog and query side)

Lowercase; collapse whitespace; unify quote characters (`"`, `''`, `″`) to `"`; unicode fractions (`½`) to ASCII; `inch`, `in`, `in.` to `in`; `foot`, `feet`, `ft` to `ft`; `mm`, `millimeter(s)` to `mm`; `#`, `no.`, `number` before a digit to `#`; separators `x` and `X` with or without spaces to a canonical ` x `; strip plural `s` on type nouns; strip quantities and noise tokens (`pcs`, `each`, `qty`, `please`, `quote`, numbers followed by `pcs`).

### Diameter

- Metric: `m(\d+)` optionally followed by `-<pitch>`.
- Imperial fraction: `(\d+)/(\d+)` optionally followed by `-<tpi>`.
- Numbered: `#(\d+)` optionally followed by `-<tpi>`.
- Whole-inch diameters only when followed by `-<tpi>` or an explicit inch diameter marker; the catalog has none.
- A bare number with a mm unit (`12 millimeter`, `12mm`) is a metric diameter (M12, provenance `inferred`) when it is the first size token or when the type takes no length (nuts, washers); it is a length when it follows the separator or another diameter.
- `known = true` when the nominal is one of the 16 catalog diameters. A parseable but unknown diameter (M14, #6) or a non-catalog pitch (1/2-20) is a legal parse that will match nothing; it feeds the null hypothesis (section 7), it is never silently ignored.

### Length

- Preferred: the token after ` x `. In `<a> x <b>`, `a` is the diameter and `b` is the length.
- Otherwise: a number attached to a unit (`60mm`, `1 inch`, `6 foot`, `1-1/4"`).
- Otherwise: a trailing number after the type phrase (`tap bolt 5/8`, `machine screw 1-1/4`).
- Mixed numbers (`1-1/4`, `2-1/2`) are always lengths, never threads.
- Fractions (`3/4`) and mixed numbers (`1-1/4`) are always inches. Whole numbers without a unit take the diameter's system (mm for metric, inches otherwise; provenance `inferred`). `ft` only when stated.
- A metric diameter with an inch length, or the reverse, adds the note `unitMismatch`; the length is kept as stated and converted only for the approximate search of alternatives (section 7).
- Two fraction-like numbers and no ` x `: the one adjacent to a unit is the length; else the one carrying `-<tpi>` is the diameter.

### Type lexicon (seed; extend during eval, keep it in one table)

| ProductType | Terms (strength 1.0 unless noted) |
|---|---|
| hex_cap_screw | hex cap screw, hex head cap screw, hhcs, hex screw (0.8), cap screw (0.5, also shcs/bhcs); hex-head family terms hex bolt, hex head bolt, hhb (1.0, shared with tap_bolt) |
| socket_head_cap_screw | socket head cap screw, shcs, socket head, socket cap screw, soc head, allen bolt, allen head |
| button_socket_cap_screw | button socket cap screw, bhcs, button head, button socket, button cap screw, btn |
| pan_machine_screw | phillips pan machine screw, pan head machine screw, pan head, phil pan, pan machine screw, pms, machine screw (0.6) |
| lag_screw | lag screw, lag bolt, lag, hex lag |
| tap_bolt | tap bolt, tap screw, full thread hex bolt; hex-head family terms hex bolt, hex head bolt, hhb (1.0, shared with hex_cap_screw) |
| threaded_rod | threaded rod, rod, all thread, allthread, atr, full thread rod, stud (0.5) |
| hex_nut | hex nut, hx nut, nut, finished hex nut, hn |
| flat_washer | flat washer, fw, washer (0.6, shared with lock_washer) |
| lock_washer | lock washer, split washer, split lock washer, spring washer, lw, washer (0.6, shared with flat_washer) |

Generic terms produce several `type` entries with their strengths (`bolt` alone: hex_cap_screw 0.5, tap_bolt 0.5, lag_screw 0.4). Use longest-match over the normalized string.

### Fuzzy matching (deterministic typo tolerance)

Before lexicon lookup, map each unknown alphabetic token of 4 or more letters to the closest lexicon word within Damerau-Levenshtein distance 1 (distance 2 from 8 letters). Never apply it to numeric tokens, units, tokens that already are lexicon words, or the protected short codes (`ss`, `zn`, `hdg`, `din`, `iso`, `nut`, `hex`, `lag`). `nutt` to nut, `haed` to head and `washr` to washer must all qualify (tests). Corrections carry strength 0.9 and provenance `corrected` with the original token, so the explanation can show `washr -> washer`. Implement it in-repo (about 40 lines); this is what replaces a runtime LLM on this data set.

### Material, finish, standard lexicon

- Material: steel; 18-8 ss, 18-8, 304, ss 304; 316 ss, 316, a4; a2 ss, a2; brass; alloy, alloy steel; stainless, ss, inox (family, strength 0.8).
- Finish: zinc, zn, zinc plated, zp; yellow zinc, yel zinc, yellow zn, yz, yellow; mech zinc, mech zn, mechanical zinc; hdg, hot dip, hot dipped, galvanized, galv; plain, pln, bare, uncoated; black oxide, blk oxide, black (0.7).
- Standard: the 7 known tokens plus loose forms (`b18.2.1`, `din912`, `iso7380`).
- Anything else (`nylon`, `grade 8`, `left hand`, `red`, `metric fine`) goes to `residue`. `grade 8` is not mapped to `CLASS 8`.

### Catalog-side parser

Must parse all 960 unique SKUs with diameter, type, material and finish populated, length populated exactly for screw/bolt/rod types, and agree with the SKU-encoded type/material/finish for every row. This is a test, not a goal.

## 7. Compatibility, match status, ranking and confidence

### Compatible set

The query's explicit and inferred attributes are constraints. An item is **compatible** when it satisfies every constraint exactly or at family level (stainless family, zinc family, hex-head family). Partial credits from weak or fuzzy terms keep an item compatible. A contradiction on any specified attribute, standard included, excludes the item. Inactive items are excluded. `C` is the compatible set. Nothing outside C is ever ranked together with C, and personalization (section 8) only sees C: this is the structural guarantee that explicit attributes win.

### Match status (decided before any number is computed)

- `unique`: C has exactly one item. One match with confidence; up to two nearest alternatives may follow, labeled as alternatives.
- `ambiguous`: C has two or more items. Top 3 of C by posterior, plus `compatibleCount` and the attributes that vary inside C.
- `none`: C is empty (unknown diameter or type, length or standard not in the catalog, contradictory combination). No matches, the failed constraint named in `notes`, up to 3 alternatives from backoff.
- `history`: the intent detector fired (section 8).
- `unparsed`: neither diameter nor type recognized. Lexical fallback, confidence capped at 0.4.

### Backoff for alternatives (status none only)

Relax constraints in this fixed order and stop at the first non-empty step: (1) drop the standard; (2) widen material and finish to their families; (3) allow an approximate length within 25% of the requested value after unit conversion, ranked by distance; (4) drop the length. Never relax diameter or type: `M14 hex nut` and `carriage bolt 3/8` return status none with a note and no alternatives. Alternatives carry `closeness` (satisfied constraints divided by specified constraints) and `relaxed` (the constraints dropped), never a confidence. Example: `M8 x 45mm SHCS` has eight active M8 socket head cap screws and none at 45 mm; response: status none, note `no M8 socket head cap screw at 45 mm`, nearest lengths as approximate alternatives.

### Ranking inside C

```
s_i = Π_a c_a(q, i),   a ∈ {diameter, type, length, material, finish, standard}
c_a = 1               attribute unspecified in the query, or exact agreement
c_a = 0.8             family agreement (stainless vs a specific SS, zinc family vs a specific zinc, hex-head family)
c_a = term strength   weak or fuzzy terms (0.5 to 0.9)
```

Contradictions do not appear here because contradicting items are not in C. Partial credits only order compatible items.

### Confidence: posterior under an explicit model

```
Hypotheses   H = C ∪ {null}                 null = "the intended product is not in this catalog"
Prior        P(null) = ε                     ε = 0.02 (config)
             P(i)    = (1 − ε) · q_i          q_i = customer prior over C (section 8); uniform 1/|C| without a customer
Likelihood   L(i)    = s_i
             L(null) = κ^|residue|            κ = 3 (config): every unrecognized token is evidence for null
Posterior    p_i = (1 − ε) · q_i · s_i  /  [ (1 − ε) · Σ_{j∈C} q_j · s_j  +  ε · κ^|residue| ]

Worked values (no customer): unique, no residue → 0.98; unique, two residue tokens → 0.84; ambiguous with 7 in C → ≈ 0.14 each.
```

Semantics to print in the README and on the page: `p_i` is the model's estimate that SKU i is the intended one, given the query, the customer and the assumptions above. ε and κ are set by hand; whether the numbers are calibrated is measured (section 11) and expected to hold only coarsely. Label thresholds (initially 0.70 and 0.35) are placeholders in the config and are attached after the calibration table exists; never describe a label as promised in docs or tests.

Properties, each a test:

- Adding a correct attribute to a query never removes the true item from C and never lowers its `p_i`.
- Residue never changes C or the order inside it; it only lowers every `p_i`.
- Any item contradicting a specified attribute is absent from `results` for every query and every customer (property test over generated queries).
- Without a customer, items of C with equal `s_i` have equal `p_i`; `Σ p_i + p_null = 1`.
- Abbreviation parity: `SHCS 7/16 x 2-1/2` and `7/16-14 x 2-1/2 socket head cap screw` return identical responses.

Explanation object per match or alternative:

```ts
interface Explanation {
  matched: { attr: string; query: string; item: string; provenance: string; partial?: boolean }[];
  unspecified: string[];
  unverified: string[];            // residue tokens
  compatibleCount: number;
  disambiguateBy: string[];        // attributes that vary inside C
  relaxed?: string[];              // alternatives only
  closeness?: number;              // alternatives only
  personalization?: { reason: string; prior: number; overriddenBy?: string[] };
}
```

### Lexical fallback and baseline

When the parser finds neither a diameter nor a type, score by token overlap over normalized description tokens (BM25-lite, in-repo, about 80 lines), cap confidence at 0.4, status `unparsed`. The same component run alone over every golden query is the baseline that the parse-and-score choice is measured against (section 11).

## 8. Personalization (stretch)

Customer profile from history, parsing each history line with the same parser (cross-check with the SKU):

```
w_line   = exp(−age_days / τ),   τ = 180 days, age measured from the latest date in the file (never the wall clock)
n_eff    = Σ w_line
λ_c      = n_eff / (n_eff + k),   k = 5              shrinkage; λ_c = 0 for an unknown or unselected customer
P(v | c) = (Σ w_line · [attribute = v] + α) / (n_eff + α · V)    α = 0.5, V = number of catalog values of the attribute
h_i      ∝ (1 + w_sku · repeat_i) · Π_{a unspecified in the query} P(a_i | c)    normalized over C; w_sku = 2
           repeat_i = recency-weighted purchases of SKU i, capped at 1; 0.5 for active items sharing diameter, type and material family with a discontinued purchased SKU
q_i      = λ_c · h_i + (1 − λ_c) / |C|              the prior used in section 7; a distribution over C
```

Rules:

- Personalization sees only C. It cannot promote an item outside C, so explicit attributes win by construction. `brass hex nut 1/2-13` for CUST-004 returns brass items only, with `personalization.overriddenBy = ["material"]` and the reason "history prefers alloy black oxide; overridden by the query".
- A prior factor applies only to attributes the query left unspecified; if the query says brass, the material factor is dropped from `h_i`.
- Sparse or conflicting history is handled by λ_c and the smoothed shares, without special cases. Test: CUST-005 (n_eff about 3) yields a mixture close to uniform.
- An inactive history item is never in C. Add the note "previously ordered PXNUT16888PL0901 is discontinued; showing closest active" and apply the 0.5 repeat weight above.
- Expected, not promised: for `M8 flat washer` and CUST-002 the 18-8 SS plain washer bought twice should reach top-1 with a clear margin (posterior around 0.65 to 0.70 under the initial parameters); for CUST-004 only the finish share acts and the A2 SS black oxide washer should be top-1 with a small margin; for CUST-005 the single earlier purchase should be top-1 with a modest margin. Record the measured values in the eval report; do not hard-code labels in tests.

Intent (IntentDetector) triggers on `same`, `last time`, `usual`, `again`, `reorder`, `like before`, `what we always get`:

- Pure reference (`the same washers as last time`), customer selected: status `history`; candidates are the customer's most recent lines whose type or diameter matches any such words in the query (`washers` covers flat and lock washers), ranked by recency; confidence 0.7 for the most recent decaying by rank; explanation carries order date and quantity.
- Reference with an override (`same washers as last time, but brass`): the referenced line's parsed attributes become the base specification, the query's explicit attributes overwrite it, and the merged specification runs through the normal pipeline with status derived from C; note "based on your 2026-04-15 order, material changed to brass".
- No customer selected: no matches, status `history`, note "select a customer to resolve 'last time'"; if the query also carries attributes, the attribute path runs and the note stays.

Alternatives to record in ADR-003 as considered and rejected: additive boost with tunable weights (its maximum is bounded by the weights, so a target label can be unreachable; no probabilistic reading); embedding centroid of purchased items; item-item co-purchase; LLM rerank with history in context. Reason: 76 history lines and the need for a transparent explanation.

## 9. API contract

```
POST /api/match
  body:   { query: string; customerId?: string; limit?: number }   // limit defaults to 3
  200:    { query; parsed: ParsedSpec;                                // every attribute with provenance
            status: MatchStatus; compatibleCount: number;
            results: Match[];                                        // empty when status is none
            alternatives: Alternative[];                             // filled when status is none; optional otherwise
            notes: string[];                                         // failed constraint, unitMismatch, discontinued item, prompts
            timingsMs: { parse: number; match: number } }
  400:    empty or whitespace-only query
  Never 500 on unparseable text: status unparsed with the lexical path.

Match       = { sku; catalogId; description; active; confidence: number /* 0..1 */; label?: 'High'|'Medium'|'Low';
                explanation: Explanation; components: { compatibility: number; prior: number } }
Alternative = { sku; catalogId; description; active; closeness: number /* 0..1 */; relaxed: string[]; explanation: Explanation }

GET /api/customers?q=
  200:    { customerId; customerName; orderCount; lastOrderDate }[]   // prefix and substring match on id and name
```

## 10. UI (single page)

- Query input (Enter submits), searchable customer combobox (id, name, order count), submit button.
- A status line first: "1 match", "7 compatible options, specify material or finish", "No M8 socket head cap screw at 45 mm; nearest lengths below", "Select a customer to resolve 'last time'".
- Up to three cards: description, SKU, active badge, confidence bar with label for matches or closeness with the relaxed constraint for alternatives, chips for matched (with provenance), unspecified and unverified attributes, personalization note when present.
- Example-query chips built from the 33 example queries, for the live demo.
- Loading and error states. Same input always renders the same output.
- No component library beyond what is needed; no client-side matching logic; the page only calls the API.

## 11. Eval harness

Data sets:

- `data/eval/golden.jsonl`, one object per line: `{ id, query, customerId?, expectedStatus, expected: string[] (single SKU or full compatible set), tags, rationale? }`. Seed with the 33 example queries: the single SKU for attribute-complete queries; the full active compatible set for tie queries; personalized expectations per customer written by hand before any tuning, each with its rationale next to it. Add at least 20 adversarial cases: unknown diameter (`M14 hex nut`, `1/2-20 hex nut`, `#6-32 screw`), unknown type (`carriage bolt 3/8`, `wing nut M6`, `nylon lock nut M8`), unknown length (`M8 x 45mm shcs`), residue (`M8 hex nut nylon insert`, `grade 8 1/2-13 hex nut`), synonyms (`stainless M8 washer`, `galvanized 3/8 lag 1-1/2`, `zinc plated 1/4-20 x 3/4 hex bolt`, `304 ss M6 nut`), unit forms and mismatches (`12 millimeter hex nut`, `1/2"`, `6 ft`, `M8 x 3/4 hex cap screw`), typos (`washr`, `hex nutt`, `socket haed`), noise (`please quote 200 pcs of M8 x 50 BHCS black oxide`), casing and whitespace, attribute order permutations, explicit standards (`M8 flat washer DIN 912`), and history references with and without a customer and with an override.
- `data/eval/heldout.jsonl`: 15 to 20 paraphrases and adversarial cases frozen before parameter tuning, run once at the end and reported separately. Never used to adjust the lexicon or the parameters.

Metrics, one per claim:

- Retrieval of the intended SKU: Hit@1, Hit@3, MRR against the single expected SKU, on single-label queries only (attribute-complete and hand-labeled personalized).
- Recovery of the compatible set: set precision and recall of C against the expected set, and the exact-set rate, on tie queries. Never Hit@1 against an accepted set.
- Status correctness: confusion matrix over unique, ambiguous, none, history, unparsed, on all queries.
- Constraint preservation: count of returned matches contradicting an explicit attribute; must be 0 on all queries with and without a customer, plus a property test over generated queries.
- Personalization: Hit@1 with vs without a customer and the margin between top-1 and top-2, on hand-labeled (query, customer) pairs.
- Calibration: bins of top-1 confidence vs empirical top-1 precision with the count per bin, on single-label queries only (tie queries mix "acceptable" and "intended", two different events).
- Baseline: the lexical fallback run alone over every golden query; report retrieval, set recovery and status correctness for both approaches side by side. This comparison is the evidence for the parse-and-score choice.

Reporting: `pnpm eval` prints the tables and writes `docs/eval-report.md`, golden and held-out separately, with the number of cases behind every number. The README states that these are limited evidence from a small labeled set: they support the design choices for this data, they do not establish calibration or generalization. It also states the circularity of personalized labels (written by a person looking at the same history the algorithm uses) and the procedural mitigations: labels before tuning, rationale recorded, held-out untouched, constraint preservation measured independently of any label. CI fails when status correctness or constraint preservation on the golden set drops below the committed baseline.

## 12. Tests and quality gates

- Unit: normalize; units (fractions, mixed numbers, mm/in/ft conversion); lexicon; description parser (960/960 with SKU cross-check); query parser (all 33 example queries plus the adversarial set, asserting the parsed spec); compatibility and status (contradiction excludes, family keeps, status per condition, backoff order); posterior (the properties in section 7); profile builder; prior (λ_c = 0 is uniform, q sums to 1 over C, unspecified-only factors); intent detector including the override form.
- Integration: API routes against the real CSVs.
- No network in any test. `tsc --noEmit` strict, ESLint, Prettier, all green in GitHub Actions: lint, typecheck, test, eval.

## 13. Phases and checkpoints

Stop at each checkpoint and report before continuing.

1. Phase 0: scaffold the workspace; CSV ingest with dedupe; `pnpm profile` script that reproduces every number in section 2. Checkpoint: the profile output matches section 2.
2. Phase 1: normalization, units, lexicon, description parser, query parser, with tests first. Checkpoint: 960/960 catalog rows parsed and SKU cross-check green; a table of the 33 example queries with their parsed spec.
3. Phase 2: compatibility filter, status, ranking, posterior, backoff alternatives, explainer, lexical fallback, API routes, eval harness with the seed golden set, held-out set frozen. Checkpoint: base eval tables including the baseline comparison and the status confusion matrix.
4. Phase 3: UI. Checkpoint: the example chips run end to end.
5. Phase 4: hand-labeled personalized cases written first (with rationale), then personalization and intent detection. Checkpoint: eval tables with lift, margins, conflict cases and the calibration table.
6. Phase 5: README (run in two commands, architecture diagram, eval table, section on how the coding agent was used and what was reviewed by hand), DESIGN.md, ADR-001 to ADR-005, ASSUMPTIONS.md, DEMO.md with the six demo queries.

Conventions: conventional commits, small commits per phase, no co-author trailers. Planning artifacts and `.superpowers/` are never committed. The app reads no environment variables and makes no network calls; there is no `.env` file. `packages/core/src/index.ts` and `packages/core/src/application/*` are edited only by the integration cards (application use case, personalization integration). The boundary rules of section 4 are part of `pnpm lint`; a card is not done while they fail. When a decision is ambiguous, write the assumption in `docs/ASSUMPTIONS.md` and continue; ask only when the answer changes the architecture.

## 14. Non-goals

Runtime LLM calls (see ADR-005), authentication, database, deployment, vector store, embeddings, fine-tuning, languages other than English, quantity parsing beyond stripping it, pricing and inventory, multi-line order parsing.

## 15. Assumptions to record in docs/ASSUMPTIONS.md

- Duplicate catalog rows are the same product; dedupe by SKU at ingest.
- Inactive items are not sellable; hidden by default; surfaced only through a history note.
- Standard tokens never imply a product type; a standard named in the query is a constraint like any other.
- Pitch is redundant with diameter in this catalog; a non-catalog pitch marks the diameter as unknown instead of being ignored.
- A2 SS is a stainless-family sibling of 18-8, not the same material.
- Recency is measured from the latest date in the history file, not from the wall clock.

## Start

Begin with Phase 0. Before writing code, restate the plan in at most 15 lines and list the seed lexicon you will implement; then proceed and stop at the first checkpoint.
