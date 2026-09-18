# Runbook

## Run it

    pnpm install
    pnpm dev

The app serves on http://localhost:3000. Node 20 or newer; pnpm is pinned in `package.json`.

No environment variables, no `.env`, no network access at runtime. The server finds
`data/catalog.csv` and `data/order_history.csv` by walking up from its working directory, so
it works from the repository root and from `apps/web` alike.

## What to expect

The page holds a query box, a customer combobox and chips for the 33 example queries.

- `1/4-20 x 3/4 hex cap screw zinc` resolves to one SKU, `PXHEX1434STZC0003`, with a
  confidence bar and the attributes that matched.
- `M8 flat washer` is ambiguous: 7 compatible options, and the status line names what would
  settle it — material, finish or standard.
- `M8 x 45mm SHCS` has no compatible item. The status line says
  `no M8 socket head cap screw at 45 mm` and three alternatives at nearby lengths follow.
- `the same washers as last time` asks for a customer first.
- Text the parser cannot read never errors: it answers unparsed. `qqq zzz nothing here`
  reads "could not parse that query", with no cards, because no token overlaps the
  catalog; `zinc plated shiny` reads "could not parse that query; showing the closest
  text matches", because a token does.

The first request of a process pays for loading both CSVs and indexing the catalog. Every
request after that answers in single-digit milliseconds.

## Personalization demo

The customer combobox re-ranks the answer; it never changes which items are compatible.

1. Run `M8 flat washer` with no customer. Seven compatible options share one confidence:
   nothing in the query separates them.
2. Select `CUST-002` (CleanRoom Pharma MFG) and run it again. The 18-8 SS plain washer
   leads, with `bought 2x, last 2026-04-15` and its prior on the card. The count stays 7.
3. Select `CUST-004` and run it again. No M8 flat washer is alloy, so only the finish share
   acts: another washer leads, by a smaller margin, and the note says the material could not
   be matched.
4. Select `CUST-005` and run it again. That history is thin, so the ranking stays close to
   even. The shrinkage is doing its work.
5. Keep `CUST-004` and run `brass hex nut 1/2-13`. Only brass comes back, and the card
   records that the query overrode the history.
6. Keep `CUST-002` and run `M16 hex nut`. The note below the cards says the SKU ordered
   before is discontinued, and the closest active nut leads.
7. Run `the same washers as last time` with no customer: the status line asks for one.
   Select `CUST-002` and run it again to get those orders back, most recent first.
8. With `CUST-002`, run `same washers as last time, but brass`: the referenced order becomes
   the base specification, and the query overwrites the material.

## Cold start with no network

1. `git clone` the repository and `cd` into it.
2. Disconnect from the network.
3. `pnpm install --offline` if the store is warm; otherwise install once online, then
   disconnect.
4. `pnpm dev`.
5. Open http://localhost:3000 and click the chip `1/4-20 x 3/4 hex cap screw zinc`.
6. Expect one card with SKU `PXHEX1434STZC0003`.

Nothing in the request path reaches the network.

## When it does not work

**`Could not find data/catalog.csv in <directory> or any directory above it.`** The server was
started outside the repository, or `data/` is missing. Both CSVs are committed; check
`git status`.

**The first request is slow, later ones are fast.** Expected: the core is built on the first
request and kept for the life of the process.

**Port 3000 is taken.** `pnpm --filter @catalog-match/web dev -p 3001`.

## Checks

    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
