import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dedupeBySku, parseCsv, parseDescription, skuTypeCode, toCatalogRows } from './profile';

const ROOT = new URL('../', import.meta.url);

export interface Filter {
  diameter?: string;
  types?: string[];
  lengthMm?: number;
  materials?: string[];
  finishes?: string[];
  standard?: string;
}

export interface CatalogMatch {
  sku: string;
  catalogId: string;
  description: string;
  active: boolean;
}

const fraction = (text: string): number => {
  const mixed = /^(\d+)-(\d+)\/(\d+)$/.exec(text);
  if (mixed !== null) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const simple = /^(\d+)\/(\d+)$/.exec(text);
  if (simple !== null) return Number(simple[1]) / Number(simple[2]);
  return Number(text);
};

/** A bare length is millimetres on a metric nominal and inches otherwise: the catalog
 * writes `M8-1.25 X 16` for 16 mm and `3/4-10 X 5/8"` for 5/8 inch. */
export function lengthMm(
  value: string | null,
  unit: string | null,
  diameter: string,
): number | null {
  if (value === null) return null;
  const n = fraction(value);
  if (unit === 'MM') return n;
  if (unit === 'FT') return n * 304.8;
  if (unit === 'IN' || unit === '"') return n * 25.4;
  return diameter.startsWith('M') ? n : n * 25.4;
}

export function compatibleSet(filter: Filter): CatalogMatch[] {
  const rows = dedupeBySku(
    toCatalogRows(parseCsv(readFileSync(new URL('data/catalog.csv', ROOT), 'utf8'))),
  );
  const matched: CatalogMatch[] = [];
  for (const row of rows) {
    const parsed = parseDescription(row.description);
    if (parsed === null) continue;
    if (filter.diameter !== undefined && parsed.diameter !== filter.diameter) continue;
    if (filter.types !== undefined && !filter.types.includes(skuTypeCode(row.sku) ?? '')) continue;
    if (filter.lengthMm !== undefined) {
      const mm = lengthMm(parsed.length, parsed.lengthUnit, parsed.diameter);
      if (mm === null || Math.abs(mm - filter.lengthMm) > 0.001) continue;
    }
    if (filter.materials !== undefined && !filter.materials.includes(parsed.material)) continue;
    if (filter.finishes !== undefined && !filter.finishes.includes(parsed.finish)) continue;
    if (filter.standard !== undefined && parsed.standard !== filter.standard) continue;
    matched.push({
      sku: row.sku,
      catalogId: row.catalogId,
      description: row.description,
      active: row.active,
    });
  }
  return matched.sort((left, right) => (left.sku < right.sku ? -1 : left.sku > right.sku ? 1 : 0));
}

export const activeSkus = (filter: Filter): string[] =>
  compatibleSet(filter)
    .filter((row) => row.active)
    .map((row) => row.sku);

const historyLines = (customerId: string): string[] => {
  const rows = parseCsv(readFileSync(new URL('data/order_history.csv', ROOT), 'utf8'));
  return rows
    .filter((row) => row.customer_id === customerId)
    .sort((left, right) => {
      const a = left.order_date ?? '';
      const b = right.order_date ?? '';
      return a < b ? 1 : a > b ? -1 : 0;
    })
    .map(
      (row) =>
        `${row.order_date} ${(row.sku ?? '').padEnd(22)} qty ${(row.quantity ?? '').padEnd(6)} ${row.catalog_description}`,
    );
};

const reviewTable = (): string[] => {
  const descriptions = new Map(compatibleSet({}).map((row) => [row.sku, row.description]));
  const lines = readFileSync(new URL('data/eval/golden.jsonl', ROOT), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  const out = [
    '| id | query | customer | status | expected | top-1 |',
    '|---|---|---|---|---|---|',
  ];
  for (const line of lines) {
    const row = JSON.parse(line) as {
      id: string;
      query: string;
      customerId: string | null;
      expectedStatus: string;
      expected: string[];
      expectedTop1?: string;
    };
    const expected = row.expected
      .map((sku) => `${sku} — ${descriptions.get(sku) ?? '?'}`)
      .join('<br>');
    const top1 =
      row.expectedTop1 === undefined
        ? ''
        : `${row.expectedTop1} — ${descriptions.get(row.expectedTop1) ?? '?'}`;
    out.push(
      `| ${row.id} | \`${row.query}\` | ${row.customerId ?? ''} | ${row.expectedStatus} | ${expected} | ${top1} |`,
    );
  }
  return out;
};

function main(): void {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === '--customer' && rest[0] !== undefined) {
    console.log(historyLines(rest[0]).join('\n'));
    return;
  }
  if (mode === '--review') {
    console.log(reviewTable().join('\n'));
    return;
  }
  if (mode === '--set') {
    const filter: Filter = JSON.parse(rest[0] ?? '{}') as Filter;
    for (const row of compatibleSet(filter))
      console.log(
        `${row.active ? ' ' : 'X'} ${row.sku.padEnd(22)} ${row.catalogId} ${row.description}`,
      );
    return;
  }
  console.log(
    'usage: npx tsx scripts/expected-sets.ts --set \'{"diameter":"M8","types":["WASH"]}\' | --customer CUST-002 | --review',
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
