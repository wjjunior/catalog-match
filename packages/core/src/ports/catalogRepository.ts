import type { CatalogItem } from '../domain/catalog';

/** Reads are synchronous because the adapter loads and parses once at construction;
 * a database-backed adapter does the same. docs/DESIGN.md 8.1. */
export interface CatalogRepository {
  all(): readonly CatalogItem[];
  /** Inactive items are never candidates, so the filter lives here rather than in
   * every caller. docs/DESIGN.md 5.3. */
  active(): readonly CatalogItem[];
  bySku(sku: string): CatalogItem | undefined;
}
