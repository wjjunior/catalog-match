import type { CatalogItem } from '../domain/catalog';

export interface CatalogRepository {
  all(): readonly CatalogItem[];
  active(): readonly CatalogItem[];
  bySku(sku: string): CatalogItem | undefined;
}
