import type { CatalogItem } from '../../domain/catalog';
import type { CatalogRepository } from '../../ports/catalogRepository';

export class InMemoryCatalogRepository implements CatalogRepository {
  private readonly items: ReadonlyMap<string, CatalogItem>;

  constructor(items: readonly CatalogItem[]) {
    const bySku = new Map<string, CatalogItem>();
    for (const item of items) {
      if (!bySku.has(item.sku)) bySku.set(item.sku, item);
    }
    this.items = bySku;
  }

  all(): readonly CatalogItem[] {
    return [...this.items.values()];
  }

  active(): readonly CatalogItem[] {
    return this.all().filter((item) => item.active);
  }

  bySku(sku: string): CatalogItem | undefined {
    return this.items.get(sku);
  }
}
