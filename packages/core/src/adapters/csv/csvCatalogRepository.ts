import { readFileSync } from 'node:fs';

import type { CatalogItem } from '../../domain/catalog';
import type { DescriptionParser } from '../../domain/contracts';
import type { CatalogRepository } from '../../ports/catalogRepository';
import { parseCsv } from './csv';

export class CsvCatalogRepository implements CatalogRepository {
  private constructor(private readonly items: ReadonlyMap<string, CatalogItem>) {}

  static load(path: string, parseDescription: DescriptionParser): CsvCatalogRepository {
    return CsvCatalogRepository.fromText(readFileSync(path, 'utf8'), parseDescription);
  }

  static fromText(text: string, parseDescription: DescriptionParser): CsvCatalogRepository {
    const items = new Map<string, CatalogItem>();

    for (const row of parseCsv(text)) {
      const sku = row['sku'] ?? '';
      // The duplicate rows differ only in catalog_id, so the first one wins.
      if (items.has(sku)) continue;

      const description = row['catalog_description'] ?? '';
      items.set(sku, {
        catalogId: row['catalog_id'] ?? '',
        sku,
        description,
        active: row['active'] === 'Y',
        spec: parseDescription.parse(description),
      });
    }

    return new CsvCatalogRepository(items);
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
