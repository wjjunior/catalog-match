import type { ProductType } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { Length, ParsedSpec } from '../domain/spec';

export interface LengthBinding {
  /** What the filter and the ranker are both given, so they cannot disagree. */
  spec: ParsedSpec;
  unbound?: Length;
}

/** Read off the items rather than declared: a hex nut has no length because no hex nut in
 * the file carries one, which is a fact about the catalog and changes when it does. */
export function lengthBearingTypes(items: readonly CatalogItem[]): ReadonlySet<ProductType> {
  const bearing = new Set<ProductType>();

  for (const item of items) {
    if (item.spec.length === undefined) continue;
    for (const entry of item.spec.type ?? []) bearing.add(entry.value);
  }

  return bearing;
}

/** A length no type the query names ever carries is unsatisfiable by construction, so it
 * is lifted off the spec instead of emptying C. Skipping it in the filter alone would not
 * do: `ranking.compatibility` throws on an item C admitted whose length it scores 0. */
export function bindLength(spec: ParsedSpec, items: readonly CatalogItem[]): LengthBinding {
  const length = spec.length;
  const readings = spec.type;
  if (length === undefined || readings === undefined || readings.length === 0) return { spec };

  const bearing = lengthBearingTypes(items);
  if (readings.some((reading) => bearing.has(reading.value))) return { spec };

  return { spec: { ...spec, length: undefined }, unbound: length };
}
