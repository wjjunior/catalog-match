import type { Finish, FinishFamily, Material, MaterialFamily } from '../domain/attributes';
import { FINISH_FAMILY, MATERIAL_FAMILY } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { ParsedSpec, Weighted } from '../domain/spec';
import { sameLength } from './compatibility';
import type { MatcherConfig } from './config';

/** The attributes s_i is a product over. docs/DESIGN.md 5.4. `pitch` is absent because a
 * non-catalog pitch already leaves the diameter unknown upstream. */
export const RANKED_ATTRIBUTES = [
  'diameter',
  'type',
  'length',
  'material',
  'finish',
  'standard',
] as const;

export type RankedAttribute = (typeof RANKED_ATTRIBUTES)[number];

const materialFamilyOf = (value: Material | MaterialFamily): MaterialFamily | undefined =>
  (MATERIAL_FAMILY as Readonly<Record<string, MaterialFamily | undefined>>)[value];

const finishFamilyOf = (value: Finish | FinishFamily): FinishFamily | undefined =>
  (FINISH_FAMILY as Readonly<Record<string, FinishFamily | undefined>>)[value];

function familyAwareCredit<V extends string, F extends string>(
  queryValue: V | F,
  itemValue: V | F,
  familyOf: (value: V | F) => F | undefined,
  config: MatcherConfig,
): number {
  if (queryValue === itemValue) return 1;
  return familyOf(itemValue) === queryValue ? config.familyCredit : 0;
}

function weightedCredit<V extends string, F extends string>(
  query: Weighted<V | F> | undefined,
  item: Weighted<V | F> | undefined,
  familyOf: (value: V | F) => F | undefined,
  config: MatcherConfig,
): number {
  if (query === undefined) return 1;
  if (item === undefined) return 0;
  return query.strength * familyAwareCredit(query.value, item.value, familyOf, config);
}

/** The strongest reading of an ambiguous term that names the item's type. The hex-head
 * family is already priced by the lexicon, so no family credit is applied here. */
function typeCredit(query: ParsedSpec, item: ParsedSpec): number {
  if (query.type === undefined || query.type.length === 0) return 1;
  if (item.type === undefined) return 0;

  let best = 0;
  for (const reading of query.type) {
    if (reading.strength > best && item.type.some((held) => held.value === reading.value)) {
      best = reading.strength;
    }
  }
  return best;
}

/** c_a of docs/DESIGN.md 5.4: 1 when unspecified or in exact agreement, `familyCredit`
 * scaled by the term's strength at family level, 0 for a contradiction. */
export function attributeCredit(
  attr: RankedAttribute,
  query: ParsedSpec,
  item: CatalogItem,
  config: MatcherConfig,
): number {
  switch (attr) {
    case 'diameter':
      if (query.diameter === undefined) return 1;
      return item.spec.diameter?.nominal === query.diameter.nominal ? 1 : 0;

    case 'length': {
      if (query.length === undefined) return 1;
      const held = item.spec.length;
      if (held === undefined) return 0;
      return sameLength(held.mm, query.length.mm) ? 1 : 0;
    }

    case 'type':
      return typeCredit(query, item.spec);

    case 'material':
      return weightedCredit(query.material, item.spec.material, materialFamilyOf, config);

    case 'finish':
      return weightedCredit(query.finish, item.spec.finish, finishFamilyOf, config);

    case 'standard':
      if (query.standard === undefined) return 1;
      return item.spec.standard === query.standard ? 1 : 0;
  }
}

/** s_i of docs/DESIGN.md 5.4, in (0, 1]. A zero credit means the item contradicts a stated
 * attribute, so it is outside C and ranking was handed something the filter should have
 * dropped; that is a caller bug, not a low score. */
export function compatibility(query: ParsedSpec, item: CatalogItem, config: MatcherConfig): number {
  let s = 1;
  for (const attr of RANKED_ATTRIBUTES) {
    const credit = attributeCredit(attr, query, item, config);
    if (credit === 0) {
      throw new Error(
        `compatibility() received ${item.sku}, which is outside the compatible set: ${attr} contradicts the query`,
      );
    }
    s *= credit;
  }
  return s;
}
