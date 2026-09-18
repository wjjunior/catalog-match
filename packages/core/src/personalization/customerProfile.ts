import { FINISHES, MATERIALS, THREAD_SYSTEMS } from '../domain/attributes';
import type { CatalogItem, CustomerProfile, HistoryLine } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import type { MatcherConfig } from '../matching/config';
import { parseDescription } from '../parsing/descriptionParser';

const MS_PER_DAY = 86_400_000;

/** Only the attributes a profile reads: a difference in residue or evidence between a
 * history line and its catalog row is not a disagreement. */
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

/** Every catalog value is keyed, so a consumer never has to recover alpha and V to price
 * a value this customer has not bought. An empty history leaves the shares uniform. */
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

/** The quantities of docs/DESIGN.md 7.2. `lines` is the whole history file, not one
 * customer's: the recency reference is its latest order date, which is what keeps the
 * demo off the wall clock. `catalog` must carry the inactive rows too, or a discontinued
 * purchase reads as a SKU the catalog never had. */
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
  const reference = Date.parse(referenceDate);
  const items = new Map(catalog.map((item) => [item.sku, item]));

  const counts = {
    material: new Map<string, number>(),
    finish: new Map<string, number>(),
    threadSystem: new Map<string, number>(),
  };
  const purchases = new Map<string, number>();
  const discontinued: string[] = [];
  const warnings: string[] = [];
  let customerName = '';
  let nEff = 0;

  for (const line of lines) {
    if (line.customerId !== customerId) continue;
    customerName ||= line.customerName;

    let spec: ParsedSpec;
    try {
      spec = parseDescription(line.description);
    } catch (error) {
      warnings.push(`${line.sku}: ${(error as Error).message}`);
      continue;
    }

    const item = items.get(line.sku);
    if (item === undefined) {
      warnings.push(`${line.sku} is not in the catalog`);
    } else {
      if (fingerprint(item.spec) !== fingerprint(spec)) {
        warnings.push(`${line.sku} disagrees with its catalog row`);
      }
      if (!item.active && !discontinued.includes(line.sku)) discontinued.push(line.sku);
    }

    const age = (reference - Date.parse(line.orderDate)) / MS_PER_DAY;
    const weight = Math.exp(-age / config.tauDays);

    nEff += weight;
    purchases.set(line.sku, (purchases.get(line.sku) ?? 0) + weight);
    count(counts.material, spec.material?.value, weight);
    count(counts.finish, spec.finish?.value, weight);
    count(counts.threadSystem, spec.diameter?.system, weight);
  }

  return {
    customerId,
    customerName,
    nEff,
    lambda: nEff / (nEff + config.k),
    referenceDate,
    shares: {
      material: shares(counts.material, MATERIALS, nEff, config.alpha),
      finish: shares(counts.finish, FINISHES, nEff, config.alpha),
      threadSystem: shares(counts.threadSystem, THREAD_SYSTEMS, nEff, config.alpha),
    },
    repeats: Object.fromEntries([...purchases].map(([sku, weight]) => [sku, Math.min(1, weight)])),
    discontinued,
    warnings,
  };
}
