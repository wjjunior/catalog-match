import type { ProductType } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { Length, ParsedSpec } from '../domain/spec';

export interface LengthBinding {
  spec: ParsedSpec;
  unbound?: Length;
}

export function lengthBearingTypes(items: readonly CatalogItem[]): ReadonlySet<ProductType> {
  const bearing = new Set<ProductType>();

  for (const item of items) {
    if (item.spec.length === undefined) continue;
    for (const entry of item.spec.type ?? []) bearing.add(entry.value);
  }

  return bearing;
}

export function bindLength(spec: ParsedSpec, items: readonly CatalogItem[]): LengthBinding {
  const length = spec.length;
  const readings = spec.type;
  if (length === undefined || readings === undefined || readings.length === 0) return { spec };

  const bearing = lengthBearingTypes(items);
  if (readings.some((reading) => bearing.has(reading.value))) return { spec };

  return { spec: { ...spec, length: undefined }, unbound: length };
}
