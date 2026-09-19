# ADR-004: No database, in-memory repositories behind ports

Status: Accepted
Date: 2026-09-18

## Context

The data is two CSV files: 1000 catalog rows deduplicating to 960 unique SKUs, of which 44
are inactive, and 76 order history lines.

## Decision

`CsvCatalogRepository` and `CsvOrderHistoryRepository` load and parse once at startup and
serve reads from memory, both behind the `CatalogRepository` and `OrderHistoryRepository`
ports. Reads are synchronous because the parse already happened. The ports are not
speculative: each already has a second implementation, the in-memory adapters the tests
and the eval harness run against, which is what makes a database-backed one an exchange
rather than a rewrite.

## Alternatives considered

| Option                      | Why not                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| Vector database or Postgres | 960 items fit in memory; infrastructure without signal at this size               |
| A separate API service      | Ceremony without signal: the package boundary already demonstrates the separation |

## Evidence

Over the 78 golden cases, measured at the limit the API actually serves
(`docs/eval-report.md`): p50 0.1 ms, p95 0.6 ms. The card budget is 50 ms. Nothing in the
request path opens a socket, and the whole suite runs with no network.

Parsing 960 descriptions at startup is the cost paid once; `apps/web/server/core.ts` builds
the core lazily so a production build never pays it.

## Consequences

`pnpm install && pnpm dev` runs the whole application from a fresh clone with no service to
start, no migration to apply and no environment variable to set. The limits are equally
plain: everything is rebuilt on restart, there is no write path, and a catalog that no
longer fits in memory has no answer here.

## Revisit trigger

Catalog scale or drift, or multi-tenant requirements (`docs/DESIGN.md` 13.2): move the
repositories to Postgres, precompute parsed attributes at ingest, re-parse on catalog
updates, and monitor parser coverage as a metric.
