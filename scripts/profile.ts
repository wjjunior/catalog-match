export type CsvRow = Record<string, string>;

export type CatalogRow = {
  catalogId: string;
  sku: string;
  description: string;
  active: boolean;
};

export type HistoryRow = {
  customerId: string;
  customerName: string;
  orderDate: string;
  sku: string;
  description: string;
  quantity: number;
};

export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);

    if (quoted) {
      if (ch !== '"') {
        field += ch;
      } else if (text.charAt(i + 1) === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (ch !== '\r') field += ch;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (header === undefined) return [];

  return rows.map((cells) =>
    Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ''])),
  );
}

export function toCatalogRows(rows: CsvRow[]): CatalogRow[] {
  return rows.map((row) => ({
    catalogId: row.catalog_id ?? '',
    sku: row.sku ?? '',
    description: row.catalog_description ?? '',
    active: (row.active ?? '') === 'Y',
  }));
}

export function toHistoryRows(rows: CsvRow[]): HistoryRow[] {
  return rows.map((row) => ({
    customerId: row.customer_id ?? '',
    customerName: row.customer_name ?? '',
    orderDate: row.order_date ?? '',
    sku: row.sku ?? '',
    description: row.catalog_description ?? '',
    quantity: Number(row.quantity ?? '0'),
  }));
}

export function dedupeBySku(rows: CatalogRow[]): CatalogRow[] {
  const first = new Map<string, CatalogRow>();
  for (const row of rows) if (!first.has(row.sku)) first.set(row.sku, row);
  return [...first.values()];
}

export function caseForm(description: string): 'all-lower' | 'all-upper' | 'mixed' {
  if (description === description.toLowerCase()) return 'all-lower';
  if (description === description.toUpperCase()) return 'all-upper';
  return 'mixed';
}

export function whitespaceIssues(description: string): string[] {
  const issues: string[] = [];
  if (description !== description.trim()) issues.push('surrounding');
  if (/\s{2,}/.test(description.trim())) issues.push('repeated');
  return issues;
}

export type Parsed = {
  diameter: string;
  pitch: string | null;
  length: string | null;
  lengthUnit: string | null;
  typePhrase: string;
  standard: string | null;
  material: string;
  finish: string;
  finishSurface: string;
};

export const MATERIALS = ['18-8 SS', '316 SS', 'A2 SS', 'STEEL', 'BRASS', 'ALLOY'] as const;

export const FINISH_SURFACES = new Map<string, string>([
  ['HDG', 'HDG'],
  ['BLACK OXIDE', 'BLACK OXIDE'],
  ['ZINC', 'ZINC'],
  ['ZN', 'ZINC'],
  ['PLAIN', 'PLAIN'],
  ['PLN', 'PLAIN'],
  ['MECH ZINC', 'MECH ZINC'],
  ['MECH ZN', 'MECH ZINC'],
  ['YELLOW ZINC', 'YELLOW ZINC'],
  ['YELLOW ZN', 'YELLOW ZINC'],
  ['YEL ZINC', 'YELLOW ZINC'],
  ['YEL ZN', 'YELLOW ZINC'],
]);

const DIAMETER = /^(#\d+|M\d+|\d+(?:-\d+\/\d+|\/\d+)?)(?:-([\d.]+))?/;
const LENGTH = /^X\s*(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\s*(MM|FT|IN|")?/;
// A standards body is a 3 or 4 letter acronym, which is what keeps the CLASS 8 of
// HEX NUT CLASS 8 inside the type phrase where it belongs.
const STANDARD = /\s([A-Z]{3,4}) ([A-Z]?\d[\w.]*)$/;
const SEPARATOR = /[\d"](\s*)([xX])(\s*)\d/;

export function normalize(description: string): string {
  return description.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function splitOnMaterial(
  normalized: string,
): { head: string; material: string; finishSurface: string } | null {
  let best: { material: string; at: number } | null = null;

  for (const material of MATERIALS) {
    const at = normalized.indexOf(material);
    if (at === -1) continue;
    if (best === null || at < best.at || (at === best.at && material.length > best.material.length)) {
      best = { material, at };
    }
  }

  if (best === null) return null;

  return {
    head: normalized.slice(0, best.at).trim(),
    material: best.material,
    finishSurface: normalized.slice(best.at + best.material.length).trim(),
  };
}

export function separatorForm(description: string): string | null {
  const match = SEPARATOR.exec(description);
  if (match === null) return null;
  return `${match[1] ?? ''}${match[2] ?? ''}${match[3] ?? ''}`;
}

export function parseDescription(description: string): Parsed | null {
  const split = splitOnMaterial(normalize(description));
  if (split === null) return null;

  const finish = FINISH_SURFACES.get(split.finishSurface);
  if (finish === undefined) return null;

  const diameter = DIAMETER.exec(split.head);
  if (diameter === null || diameter[1] === undefined) return null;

  let rest = split.head.slice(diameter[0].length).trim();

  const length = LENGTH.exec(rest);
  if (length !== null) rest = rest.slice(length[0].length).trim();

  const standard = STANDARD.exec(` ${rest}`);
  const typePhrase =
    standard === null ? rest : rest.slice(0, rest.length - (standard[0].length - 1)).trim();

  return {
    diameter: diameter[1],
    pitch: diameter[2] ?? null,
    length: length?.[1] ?? null,
    lengthUnit: length === null ? null : (length[2] ?? ''),
    typePhrase,
    standard: standard === null ? null : `${standard[1] ?? ''} ${standard[2] ?? ''}`,
    material: split.material,
    finish,
    finishSurface: split.finishSurface,
  };
}
