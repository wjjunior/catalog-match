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
    if (
      best === null ||
      at < best.at ||
      (at === best.at && material.length > best.material.length)
    ) {
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

export const TYPE_CODES = [
  'LOCK',
  'WASH',
  'LAG',
  'ROD',
  'HEX',
  'SOC',
  'NUT',
  'BTN',
  'TAP',
  'PAN',
] as const;

export type CatalogStats = {
  rawRows: number;
  uniqueSkus: number;
  duplicateRows: number;
  inactiveRows: number;
  inactiveSkus: number;
  lowercaseAllRaw: number;
  lowercaseAllSku: number;
  lowercaseAnyRaw: number;
  whitespaceIrregular: number;
  unparsed: string[];
  typePhrasesByType: Map<string, Map<string, number>>;
  diameterPitches: Map<string, Set<string>>;
  rowsWithoutPitch: number;
  lengthPresenceByType: Map<string, { withLength: number; withoutLength: number }>;
  unitForms: Map<string, number>;
  separatorForms: Map<string, number>;
  materialFinish: Map<string, Map<string, number>>;
  finishSurfaces: Map<string, number>;
  standards: Map<string, number>;
  rowsWithStandard: number;
  standardByType: Map<string, Map<string, number>>;
  fullTuples: number;
  tuplesWithoutStandard: number;
  lengthGroups: number;
  lengthGroupsUnique: number;
};

export function skuTypeCode(sku: string): string | null {
  const body = sku.slice(2);
  let found: string | null = null;
  for (const code of TYPE_CODES) {
    if (!body.startsWith(code)) continue;
    if (found === null || code.length > found.length) found = code;
  }
  return found;
}

function bump<K>(counter: Map<K, number>, key: K): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function nested(outer: Map<string, Map<string, number>>, key: string): Map<string, number> {
  const inner = outer.get(key) ?? new Map<string, number>();
  outer.set(key, inner);
  return inner;
}

export function catalogStats(raw: CatalogRow[]): CatalogStats {
  const bySku = dedupeBySku(raw);
  const inactive = raw.filter((row) => !row.active);

  const stats: CatalogStats = {
    rawRows: raw.length,
    uniqueSkus: bySku.length,
    duplicateRows: raw.length - bySku.length,
    inactiveRows: inactive.length,
    inactiveSkus: new Set(inactive.map((row) => row.sku)).size,
    lowercaseAllRaw: raw.filter((row) => caseForm(row.description) === 'all-lower').length,
    lowercaseAllSku: bySku.filter((row) => caseForm(row.description) === 'all-lower').length,
    lowercaseAnyRaw: raw.filter((row) => caseForm(row.description) !== 'all-upper').length,
    whitespaceIrregular: raw.filter((row) => whitespaceIssues(row.description).length > 0).length,
    unparsed: [],
    typePhrasesByType: new Map(),
    diameterPitches: new Map(),
    rowsWithoutPitch: 0,
    lengthPresenceByType: new Map(),
    unitForms: new Map(),
    separatorForms: new Map(),
    materialFinish: new Map(),
    finishSurfaces: new Map(),
    standards: new Map(),
    rowsWithStandard: 0,
    standardByType: new Map(),
    fullTuples: 0,
    tuplesWithoutStandard: 0,
    lengthGroups: 0,
    lengthGroupsUnique: 0,
  };

  const full = new Set<string>();
  const withoutStandard = new Set<string>();
  const lengthGroups = new Map<string, number>();

  for (const row of bySku) {
    const separator = separatorForm(row.description);
    if (separator !== null) bump(stats.separatorForms, separator);

    const parsed = parseDescription(row.description);
    const type = skuTypeCode(row.sku);
    if (parsed === null || type === null) {
      stats.unparsed.push(row.description);
      continue;
    }

    bump(nested(stats.typePhrasesByType, type), parsed.typePhrase);

    const pitches = stats.diameterPitches.get(parsed.diameter) ?? new Set<string>();
    if (parsed.pitch !== null) pitches.add(parsed.pitch);
    else stats.rowsWithoutPitch += 1;
    stats.diameterPitches.set(parsed.diameter, pitches);

    const presence = stats.lengthPresenceByType.get(type) ?? { withLength: 0, withoutLength: 0 };
    if (parsed.length === null) presence.withoutLength += 1;
    else presence.withLength += 1;
    stats.lengthPresenceByType.set(type, presence);

    if (parsed.lengthUnit !== null) {
      bump(stats.unitForms, parsed.lengthUnit === '' ? '(mark absent)' : parsed.lengthUnit);
    }

    bump(nested(stats.materialFinish, parsed.material), parsed.finish);
    bump(stats.finishSurfaces, parsed.finishSurface);

    if (parsed.standard !== null) {
      stats.rowsWithStandard += 1;
      bump(stats.standards, parsed.standard);
      bump(nested(stats.standardByType, type), parsed.standard);
    }

    full.add(
      [parsed.diameter, parsed.length, type, parsed.material, parsed.finish, parsed.standard].join(
        '|',
      ),
    );
    withoutStandard.add(
      [parsed.diameter, parsed.length, type, parsed.material, parsed.finish].join('|'),
    );

    // DESIGN's 668 groups count only rows that carry a length; over all rows it is 716,
    // the difference being the three lengthless types across the sixteen diameters.
    if (parsed.length !== null) {
      bump(lengthGroups, [parsed.diameter, type, parsed.length].join('|'));
    }
  }

  stats.fullTuples = full.size;
  stats.tuplesWithoutStandard = withoutStandard.size;
  stats.lengthGroups = lengthGroups.size;
  stats.lengthGroupsUnique = [...lengthGroups.values()].filter((count) => count === 1).length;

  return stats;
}

export type CustomerStats = {
  customerId: string;
  customerName: string;
  lines: number;
  orders: number;
  repeatSkus: number;
  materialShares: Map<string, number>;
  finishShares: Map<string, number>;
  metricShare: number;
};

export type HistoryStats = {
  lines: number;
  customers: number;
  firstDate: string;
  lastDate: string;
  skusMissingFromCatalog: string[];
  inactiveSkusPurchased: string[];
  byCustomer: CustomerStats[];
};

export function historyStats(history: HistoryRow[], catalog: CatalogRow[]): HistoryStats {
  const known = new Set(catalog.map((row) => row.sku));
  const inactive = new Set(catalog.filter((row) => !row.active).map((row) => row.sku));
  const dates = history.map((row) => row.orderDate).sort();

  const grouped = new Map<string, HistoryRow[]>();
  for (const row of history) {
    const lines = grouped.get(row.customerId) ?? [];
    lines.push(row);
    grouped.set(row.customerId, lines);
  }

  const byCustomer = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([customerId, lines]) => {
      const skuCounts = new Map<string, number>();
      const materialShares = new Map<string, number>();
      const finishShares = new Map<string, number>();
      let metric = 0;

      for (const line of lines) {
        bump(skuCounts, line.sku);
        const parsed = parseDescription(line.description);
        if (parsed === null) continue;
        bump(materialShares, parsed.material);
        bump(finishShares, parsed.finish);
        if (parsed.diameter.startsWith('M')) metric += 1;
      }

      return {
        customerId,
        customerName: lines[0]?.customerName ?? '',
        lines: lines.length,
        orders: new Set(lines.map((line) => line.orderDate)).size,
        repeatSkus: [...skuCounts.values()].filter((count) => count > 1).length,
        materialShares,
        finishShares,
        metricShare: lines.length === 0 ? 0 : metric / lines.length,
      };
    });

  return {
    lines: history.length,
    customers: grouped.size,
    firstDate: dates[0] ?? '',
    lastDate: dates[dates.length - 1] ?? '',
    skusMissingFromCatalog: [...new Set(history.map((row) => row.sku))]
      .filter((sku) => !known.has(sku))
      .sort(),
    inactiveSkusPurchased: [...new Set(history.map((row) => row.sku))]
      .filter((sku) => inactive.has(sku))
      .sort(),
    byCustomer,
  };
}
