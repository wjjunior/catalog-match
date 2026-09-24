import { FINISHES, MATERIALS, THREAD_SYSTEMS } from '../domain/attributes';
import type { CatalogItem, CustomerProfile, HistoryLine, Purchase } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import type { MatcherConfig } from '../matching/config';
import { parseDescription } from '../parsing/descriptionParser';

const MS_PER_DAY = 86_400_000;

function fingerprint(spec: ParsedSpec): string {
  return JSON.stringify([
    spec.diameter,
    spec.pitch,
    spec.length,
    spec.type?.[0]?.value,
    spec.material?.value,
    spec.finish?.value,
    spec.standard,
  ]);
}

function count(counts: Map<string, number>, value: string | undefined, weight: number): void {
  if (value === undefined) return;
  counts.set(value, (counts.get(value) ?? 0) + weight);
}

function shares(
  counts: ReadonlyMap<string, number>,
  values: readonly string[],
  nEff: number,
  alpha: number,
): Record<string, number> {
  const denominator = nEff + alpha * values.length;
  const keys = new Set([...values, ...counts.keys()]);

  return Object.fromEntries(
    [...keys].map((value) => [value, ((counts.get(value) ?? 0) + alpha) / denominator]),
  );
}

interface ProfileCounts {
  material: Map<string, number>;
  finish: Map<string, number>;
  threadSystem: Map<string, number>;
}

interface ProfileBuilder {
  counts: ProfileCounts;
  weights: Map<string, number>;
  purchases: Map<string, Purchase>;
  discontinued: string[];
  warnings: string[];
  customerName: string;
  nEff: number;
  reference: number;
  items: ReadonlyMap<string, CatalogItem>;
  tauDays: number;
}

function noteCatalog(builder: ProfileBuilder, line: HistoryLine, spec: ParsedSpec): void {
  const item = builder.items.get(line.sku);
  if (item === undefined) {
    builder.warnings.push(`${line.sku} is not in the catalog`);
    return;
  }

  if (fingerprint(item.spec) !== fingerprint(spec)) {
    builder.warnings.push(`${line.sku} disagrees with its catalog row`);
  }
  if (!item.active && !builder.discontinued.includes(line.sku)) {
    builder.discontinued.push(line.sku);
  }
}

function recordPurchase(
  purchases: Map<string, Purchase>,
  sku: string,
  orderDate: string,
  spec: ParsedSpec,
): void {
  const previous = purchases.get(sku);
  const keepPrevious = previous !== undefined && previous.lastOrderDate > orderDate;

  purchases.set(sku, {
    count: (previous?.count ?? 0) + 1,
    lastOrderDate: keepPrevious ? previous.lastOrderDate : orderDate,
    spec: keepPrevious ? previous.spec : spec,
  });
}

function accumulateLine(builder: ProfileBuilder, line: HistoryLine): void {
  builder.customerName ||= line.customerName;

  let spec: ParsedSpec;
  try {
    spec = parseDescription(line.description);
  } catch (error) {
    builder.warnings.push(`${line.sku}: ${(error as Error).message}`);
    return;
  }

  noteCatalog(builder, line, spec);

  const age = (builder.reference - Date.parse(line.orderDate)) / MS_PER_DAY;
  const weight = Math.exp(-age / builder.tauDays);

  builder.nEff += weight;
  builder.weights.set(line.sku, (builder.weights.get(line.sku) ?? 0) + weight);
  recordPurchase(builder.purchases, line.sku, line.orderDate, spec);
  count(builder.counts.material, spec.material?.value, weight);
  count(builder.counts.finish, spec.finish?.value, weight);
  count(builder.counts.threadSystem, spec.diameter?.system, weight);
}

export function buildProfile(
  customerId: string,
  lines: readonly HistoryLine[],
  catalog: readonly CatalogItem[],
  config: MatcherConfig,
): CustomerProfile {
  const referenceDate = lines.reduce(
    (latest, line) => (line.orderDate > latest ? line.orderDate : latest),
    '',
  );

  const builder: ProfileBuilder = {
    counts: {
      material: new Map(),
      finish: new Map(),
      threadSystem: new Map(),
    },
    weights: new Map(),
    purchases: new Map(),
    discontinued: [],
    warnings: [],
    customerName: '',
    nEff: 0,
    reference: Date.parse(referenceDate),
    items: new Map(catalog.map((item) => [item.sku, item])),
    tauDays: config.tauDays,
  };

  for (const line of lines) {
    if (line.customerId !== customerId) continue;
    accumulateLine(builder, line);
  }

  return {
    customerId,
    customerName: builder.customerName,
    nEff: builder.nEff,
    lambda: builder.nEff / (builder.nEff + config.k),
    referenceDate,
    shares: {
      material: shares(builder.counts.material, MATERIALS, builder.nEff, config.alpha),
      finish: shares(builder.counts.finish, FINISHES, builder.nEff, config.alpha),
      threadSystem: shares(builder.counts.threadSystem, THREAD_SYSTEMS, builder.nEff, config.alpha),
    },
    repeats: Object.fromEntries(
      [...builder.weights].map(([sku, weight]) => [sku, Math.min(1, weight)]),
    ),
    purchases: Object.fromEntries(builder.purchases),
    discontinued: builder.discontinued,
    warnings: builder.warnings,
  };
}
