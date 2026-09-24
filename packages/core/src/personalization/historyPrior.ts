import type { Material, MaterialFamily } from '../domain/attributes';
import { MATERIAL_FAMILY, MATERIALS } from '../domain/attributes';
import type { CatalogItem, CustomerProfile, Purchase } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import type { MatcherConfig } from '../matching/config';

type ShareName = 'material' | 'finish' | 'threadSystem';

export interface PriorReason {
  repeat: number;
  purchase?: Omit<Purchase, 'spec'>;
  discontinuedSibling?: string;
  shares: Partial<Record<ShareName, number>>;
}

export interface HistoryPriorResult {
  q: ReadonlyMap<string, number>;
  reasons: ReadonlyMap<string, PriorReason>;
}

function shareNames(spec: ParsedSpec): ShareName[] {
  const names: ShareName[] = [];
  if (spec.material === undefined) names.push('material');
  if (spec.finish === undefined) names.push('finish');
  if (spec.diameter === undefined) names.push('threadSystem');
  return names;
}

function valueOf(spec: ParsedSpec, name: ShareName): string | undefined {
  switch (name) {
    case 'material':
      return spec.material?.value;
    case 'finish':
      return spec.finish?.value;
    case 'threadSystem':
      return spec.diameter?.system;
  }
}

const isMaterial = (value: string): value is Material =>
  (MATERIALS as readonly string[]).includes(value);

function familyOf(value: Material | MaterialFamily | undefined): MaterialFamily | undefined {
  if (value === undefined) return undefined;
  if (isMaterial(value)) return MATERIAL_FAMILY[value];
  return value;
}

function siblingKey(spec: ParsedSpec | undefined): string | undefined {
  if (spec === undefined) return undefined;

  const diameter = spec.diameter;
  const type = spec.type?.[0]?.value;
  const family = familyOf(spec.material?.value);
  if (diameter === undefined || type === undefined || family === undefined) return undefined;

  return `${diameter.system}:${diameter.nominal}:${type}:${family}`;
}

function discontinuedSiblings(profile: CustomerProfile | undefined): ReadonlyMap<string, string> {
  const found = new Map<string, string>();

  for (const sku of [...(profile?.discontinued ?? [])].sort()) {
    const key = siblingKey(profile?.purchases[sku]?.spec);
    if (key !== undefined && !found.has(key)) found.set(key, sku);
  }

  return found;
}

function weigh(
  item: CatalogItem,
  profile: CustomerProfile | undefined,
  names: readonly ShareName[],
): { factor: number; shares: Partial<Record<ShareName, number>> } {
  const shares: Partial<Record<ShareName, number>> = {};
  let factor = 1;

  for (const name of names) {
    const value = valueOf(item.spec, name);
    if (value === undefined) continue;

    const share = profile?.shares[name][value];
    if (share === undefined) continue;

    shares[name] = share;
    factor *= share;
  }

  return { factor, shares };
}

function reasonFor(
  item: CatalogItem,
  profile: CustomerProfile | undefined,
  shares: Partial<Record<ShareName, number>>,
  siblingOf: ReadonlyMap<string, string>,
  config: MatcherConfig,
): PriorReason {
  const purchase = profile?.purchases[item.sku];
  const own = profile?.repeats[item.sku] ?? 0;
  const key = siblingKey(item.spec);
  const sibling = key === undefined ? undefined : siblingOf.get(key);

  return {
    repeat: sibling === undefined ? own : Math.max(own, config.siblingCredit),
    ...(purchase === undefined
      ? {}
      : { purchase: { count: purchase.count, lastOrderDate: purchase.lastOrderDate } }),
    ...(sibling === undefined ? {} : { discontinuedSibling: sibling }),
    shares,
  };
}

const bySku = (a: CatalogItem, b: CatalogItem): number =>
  a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;

export function historyPrior(
  profile: CustomerProfile | undefined,
  spec: ParsedSpec,
  candidates: readonly CatalogItem[],
  config: MatcherConfig,
): HistoryPriorResult {
  const names = shareNames(spec);
  const siblingOf = discontinuedSiblings(profile);

  const entries = [...candidates].sort(bySku).map((item) => {
    const { factor, shares } = weigh(item, profile, names);
    const reason = reasonFor(item, profile, shares, siblingOf, config);
    return { sku: item.sku, weight: (1 + config.wSku * reason.repeat) * factor, reason };
  });

  const mass = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const lambda = profile?.lambda ?? 0;
  const share = candidates.length === 0 ? 0 : 1 / candidates.length;
  const h = (weight: number): number => (mass === 0 ? share : weight / mass);

  return {
    q: new Map(entries.map((e) => [e.sku, lambda * h(e.weight) + (1 - lambda) * share])),
    reasons: new Map(entries.map((e) => [e.sku, e.reason])),
  };
}
