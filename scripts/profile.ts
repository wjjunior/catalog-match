import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

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

const NUMBERED_DIAMETER = /^(#\d+)(?:-([\d.]+))?/;
const METRIC_DIAMETER = /^(M\d+)(?:-([\d.]+))?/;
const FRACTION_DIAMETER = /^(\d+(?:-\d+\/\d+|\/\d+)?)(?:-([\d.]+))?/;
const LENGTH = /^X\s*(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\s*(MM|FT|IN|")?/;
const STANDARD = /\s([A-Z]{3,4}) ([A-Z]?\d[\w.]*)$/;
const SEPARATOR = /[\d"](\s*)([xX])(\s*)\d/;

function matchDiameter(head: string): RegExpExecArray | null {
  return NUMBERED_DIAMETER.exec(head) ?? METRIC_DIAMETER.exec(head) ?? FRACTION_DIAMETER.exec(head);
}

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

  const diameter = matchDiameter(split.head);
  if (diameter?.[1] === undefined) return null;

  let rest = split.head.slice(diameter[0].length).trim();

  const length = LENGTH.exec(rest);
  if (length !== null) rest = rest.slice(length[0].length).trim();

  const prefixed = ` ${rest}`;
  const standard = STANDARD.exec(prefixed);
  const typePhrase = standard === null ? rest : prefixed.slice(0, standard.index).trim();

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
  whitespaceSurrounding: number;
  whitespaceRepeated: number;
  descriptionParseFailures: number;
  unrecognizedSkuTypes: number;
  unparsedRows: number;
  m8FlatWasherActive: number;
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

// Locale-independent string ordering: localeCompare varies by system locale (e.g. Lithuanian
// collates Y between I and J), which would reorder report rows and diff docs/data-profile.md.
function byKey(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function recordSkuRow(
  stats: CatalogStats,
  row: CatalogRow,
): { parsed: Parsed; type: string } | undefined {
  const separator = separatorForm(row.description);
  if (separator !== null) bump(stats.separatorForms, separator);

  const parsed = parseDescription(row.description);
  const type = skuTypeCode(row.sku);
  if (parsed === null) stats.descriptionParseFailures += 1;
  if (type === null) stats.unrecognizedSkuTypes += 1;
  if (parsed === null || type === null) {
    stats.unparsedRows += 1;
    return undefined;
  }

  if (parsed.diameter === 'M8' && type === 'WASH' && row.active) stats.m8FlatWasherActive += 1;

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

  return { parsed, type };
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
    whitespaceSurrounding: raw.filter((row) =>
      whitespaceIssues(row.description).includes('surrounding'),
    ).length,
    whitespaceRepeated: raw.filter((row) => whitespaceIssues(row.description).includes('repeated'))
      .length,
    descriptionParseFailures: 0,
    unrecognizedSkuTypes: 0,
    unparsedRows: 0,
    m8FlatWasherActive: 0,
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
    const recorded = recordSkuRow(stats, row);
    if (recorded === undefined) continue;

    const { parsed, type } = recorded;
    full.add(
      [parsed.diameter, parsed.length, type, parsed.material, parsed.finish, parsed.standard].join(
        '|',
      ),
    );
    withoutStandard.add(
      [parsed.diameter, parsed.length, type, parsed.material, parsed.finish].join('|'),
    );

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
  materialCounts: Map<string, number>;
  finishCounts: Map<string, number>;
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

export function historyStats(history: HistoryRow[], deduped: CatalogRow[]): HistoryStats {
  const known = new Set(deduped.map((row) => row.sku));
  const inactive = new Set(deduped.filter((row) => !row.active).map((row) => row.sku));
  const dates = history.map((row) => row.orderDate).sort();

  const grouped = new Map<string, HistoryRow[]>();
  for (const row of history) {
    const lines = grouped.get(row.customerId) ?? [];
    lines.push(row);
    grouped.set(row.customerId, lines);
  }

  const byCustomer = [...grouped.entries()]
    .sort(([left], [right]) => byKey(left, right))
    .map(([customerId, lines]) => {
      const skuCounts = new Map<string, number>();
      const materialCounts = new Map<string, number>();
      const finishCounts = new Map<string, number>();
      let metric = 0;

      for (const line of lines) {
        bump(skuCounts, line.sku);
        const parsed = parseDescription(line.description);
        if (parsed === null) continue;
        bump(materialCounts, parsed.material);
        bump(finishCounts, parsed.finish);
        if (parsed.diameter.startsWith('M')) metric += 1;
      }

      return {
        customerId,
        customerName: lines[0]?.customerName ?? '',
        lines: lines.length,
        orders: new Set(lines.map((line) => line.orderDate)).size,
        repeatSkus: [...skuCounts.values()].filter((count) => count > 1).length,
        materialCounts,
        finishCounts,
        metricShare: lines.length === 0 ? 0 : metric / lines.length,
      };
    });

  return {
    lines: history.length,
    customers: grouped.size,
    firstDate: dates[0] ?? '',
    lastDate: dates.at(-1) ?? '',
    skusMissingFromCatalog: [...new Set(history.map((row) => row.sku))]
      .filter((sku) => !known.has(sku))
      .sort(),
    inactiveSkusPurchased: [...new Set(history.map((row) => row.sku))]
      .filter((sku) => inactive.has(sku))
      .sort(),
    byCustomer,
  };
}

export type Anchor = {
  label: string;
  observed: string;
  expected: string;
  basis: 'raw' | 'sku' | 'history';
  status: 'match' | 'differs';
};

function anchor(label: string, observed: string, expected: string, basis: Anchor['basis']): Anchor {
  return { label, observed, expected, basis, status: observed === expected ? 'match' : 'differs' };
}

export function compareAnchors(catalog: CatalogStats, history: HistoryStats): Anchor[] {
  const typeCounts = [...catalog.typePhrasesByType.values()].map((phrases) =>
    [...phrases.values()].reduce((total, count) => total + count, 0),
  );
  const typeRange =
    typeCounts.length === 0
      ? '0'
      : `${catalog.typePhrasesByType.size} types, ${Math.min(...typeCounts)} to ${Math.max(...typeCounts)}`;
  const combinations = [...catalog.materialFinish.values()].reduce(
    (total, finishes) => total + finishes.size,
    0,
  );
  const perCustomer = (pick: (customer: CustomerStats) => number): string =>
    history.byCustomer.map(pick).join(', ');

  return [
    anchor('Rows', String(catalog.rawRows), '1000', 'raw'),
    anchor('Unique SKUs', String(catalog.uniqueSkus), '960', 'raw'),
    anchor('Duplicate rows', String(catalog.duplicateRows), '40', 'raw'),
    anchor('Inactive rows', String(catalog.inactiveRows), '45', 'raw'),
    anchor('Inactive unique SKUs', String(catalog.inactiveSkus), '44', 'raw'),
    anchor('Fully lowercase descriptions', String(catalog.lowercaseAllRaw), '74', 'raw'),
    anchor('Product types', typeRange, '10 types, 86 to 103', 'sku'),
    anchor('Diameters', String(catalog.diameterPitches.size), '16', 'sku'),
    anchor(
      'Diameters with more than one pitch',
      String([...catalog.diameterPitches.values()].filter((pitches) => pitches.size > 1).length),
      '0',
      'sku',
    ),
    anchor('Rows without a pitch', String(catalog.rowsWithoutPitch), '1', 'sku'),
    anchor('Materials', String(catalog.materialFinish.size), '6', 'sku'),
    anchor('Finish surface forms', String(catalog.finishSurfaces.size), '12', 'sku'),
    anchor('Material x finish combinations', String(combinations), '36', 'sku'),
    anchor('Descriptions parsed', String(catalog.uniqueSkus - catalog.unparsedRows), '960', 'sku'),
    anchor('Standard tokens', String(catalog.standards.size), '7', 'sku'),
    anchor('Full tuples', String(catalog.fullTuples), '960', 'sku'),
    anchor('Tuples without the standard', String(catalog.tuplesWithoutStandard), '950', 'sku'),
    anchor('Length groups', String(catalog.lengthGroups), '668', 'sku'),
    anchor('Length groups that are unique', String(catalog.lengthGroupsUnique), '654', 'sku'),
    anchor(
      'M8 flat washer, active compatible SKUs',
      String(catalog.m8FlatWasherActive),
      '7',
      'sku',
    ),
    anchor('History lines', String(history.lines), '76', 'history'),
    anchor('History customers', String(history.customers), '5', 'history'),
    anchor('First order date', history.firstDate, '2025-07-20', 'history'),
    anchor('Last order date', history.lastDate, '2026-04-25', 'history'),
    anchor(
      'History SKUs absent from the catalog',
      String(history.skusMissingFromCatalog.length),
      '0',
      'history',
    ),
    anchor(
      'Inactive SKUs purchased',
      history.inactiveSkusPurchased.join(', '),
      'PXNUT16888PL0901',
      'history',
    ),
    anchor(
      'Lines per customer',
      perCustomer((customer) => customer.lines),
      '18, 17, 17, 18, 6',
      'history',
    ),
    anchor(
      'Repeat SKUs per customer',
      perCustomer((customer) => customer.repeatSkus),
      '1, 4, 1, 1, 0',
      'history',
    ),
  ];
}

const ROOT = new URL('../', import.meta.url);

function table(header: string[], rows: string[][]): string {
  return [
    `| ${header.join(' | ')} |`,
    `|${header.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function sortedEntries(counter: Map<string, number>): [string, number][] {
  return [...counter.entries()].sort(([left], [right]) => byKey(left, right));
}

export function renderReport(
  catalog: CatalogStats,
  history: HistoryStats,
  anchors: Anchor[],
): string {
  const differing = anchors.filter((item) => item.status === 'differs');

  const sections = [
    '# Data profile',
    '',
    'Generated by `pnpm run profile`. Do not edit by hand.',
    '',
    'Basis: `raw` is the 1000 catalog rows as read, `sku` the 960 left after deduplicating',
    'by SKU keeping the first `catalog_id`, `history` the order history file.',
    '',
    '## Anchors against docs/DESIGN.md 3.1 to 3.3',
    '',
    table(
      ['Figure', 'Observed', 'Expected', 'Basis', 'Status'],
      anchors.map((item) => [item.label, item.observed, item.expected, item.basis, item.status]),
    ),
    '',
    '## Discrepancies',
    '',
    differing.length === 0
      ? 'None. Every anchor reproduced.'
      : differing
          .map(
            (item) =>
              `- **${item.label}** (${item.basis}): observed ${item.observed}, DESIGN states ${item.expected}.`,
          )
          .join('\n'),
    '',
    '## Type phrase variants',
    '',
    table(
      ['Type', 'SKUs', 'Phrase variants'],
      [...catalog.typePhrasesByType.entries()]
        .sort(([left], [right]) => byKey(left, right))
        .map(([type, phrases]) => [
          type,
          String([...phrases.values()].reduce((total, count) => total + count, 0)),
          sortedEntries(phrases)
            .map(([phrase, count]) => `${phrase} (${count})`)
            .join('; '),
        ]),
    ),
    '',
    '## Diameters and their pitch',
    '',
    table(
      ['Diameter', 'Pitch or TPI'],
      [...catalog.diameterPitches.entries()]
        .sort(([left], [right]) => byKey(left, right))
        .map(([diameter, pitches]) => [diameter, [...pitches].sort().join(', ') || '(none)']),
    ),
    '',
    `Rows carrying no pitch: ${catalog.rowsWithoutPitch}.`,
    '',
    '## Length presence per type',
    '',
    table(
      ['Type', 'With a length', 'Without a length'],
      [...catalog.lengthPresenceByType.entries()]
        .sort(([left], [right]) => byKey(left, right))
        .map(([type, presence]) => [
          type,
          String(presence.withLength),
          String(presence.withoutLength),
        ]),
    ),
    '',
    '## Unit and separator forms',
    '',
    table(
      ['Unit form', 'Rows'],
      sortedEntries(catalog.unitForms).map(([form, count]) => [form, String(count)]),
    ),
    '',
    table(
      ['Separator form', 'Rows'],
      sortedEntries(catalog.separatorForms).map(([form, count]) => [`\`${form}\``, String(count)]),
    ),
    '',
    '## Material x finish',
    '',
    table(
      ['Material', 'Finish', 'SKUs'],
      [...catalog.materialFinish.entries()]
        .sort(([left], [right]) => byKey(left, right))
        .flatMap(([material, finishes]) =>
          sortedEntries(finishes).map(([finish, count]) => [material, finish, String(count)]),
        ),
    ),
    '',
    '### Finish surface forms',
    '',
    table(
      ['Surface form', 'Finish', 'Rows'],
      sortedEntries(catalog.finishSurfaces).map(([form, count]) => [
        form,
        FINISH_SURFACES.get(form) ?? '',
        String(count),
      ]),
    ),
    '',
    '## Standards',
    '',
    `Carried by ${catalog.rowsWithStandard} of ${catalog.uniqueSkus} SKUs ` +
      `(${((catalog.rowsWithStandard / catalog.uniqueSkus) * 100).toFixed(1)}%).`,
    '',
    table(
      ['Standard', 'SKUs'],
      sortedEntries(catalog.standards).map(([standard, count]) => [standard, String(count)]),
    ),
    '',
    '### Standards by type',
    '',
    'Independence shows as every standard appearing under every type.',
    '',
    table(
      ['Type', 'Standards'],
      [...catalog.standardByType.entries()]
        .sort(([left], [right]) => byKey(left, right))
        .map(([type, standards]) => [
          type,
          sortedEntries(standards)
            .map(([standard, count]) => `${standard} (${count})`)
            .join('; '),
        ]),
    ),
    '',
    '## Noise',
    '',
    `Fully lowercase descriptions: ${catalog.lowercaseAllRaw} raw, ${catalog.lowercaseAllSku} deduped.`,
    `Descriptions carrying any lowercase character: ${catalog.lowercaseAnyRaw} raw.`,
    `Rows with surrounding whitespace: ${catalog.whitespaceSurrounding}.`,
    `Rows with repeated whitespace: ${catalog.whitespaceRepeated}.`,
    `Descriptions that failed to parse: ${catalog.descriptionParseFailures}.`,
    `SKU type codes not recognized: ${catalog.unrecognizedSkuTypes}.`,
    '',
    '## Order history',
    '',
    `${history.lines} lines, ${history.customers} customers, ${history.firstDate} to ${history.lastDate}.`,
    `SKUs absent from the catalog: ${history.skusMissingFromCatalog.join(', ') || 'none'}.`,
    `Inactive SKUs purchased: ${history.inactiveSkusPurchased.join(', ') || 'none'}.`,
    '',
    table(
      [
        'Customer',
        'Name',
        'Lines',
        'Orders',
        'Repeat SKUs',
        'Metric share',
        'Materials',
        'Finishes',
      ],
      history.byCustomer.map((customer) => [
        customer.customerId,
        customer.customerName,
        String(customer.lines),
        String(customer.orders),
        String(customer.repeatSkus),
        `${(customer.metricShare * 100).toFixed(0)}%`,
        sortedEntries(customer.materialCounts)
          .map(([name, count]) => `${name} (${count})`)
          .join('; '),
        sortedEntries(customer.finishCounts)
          .map(([name, count]) => `${name} (${count})`)
          .join('; '),
      ]),
    ),
    '',
  ];

  return sections.join('\n');
}

function main(): void {
  const catalogRows = toCatalogRows(
    parseCsv(readFileSync(new URL('data/catalog.csv', ROOT), 'utf8')),
  );
  const historyRows = toHistoryRows(
    parseCsv(readFileSync(new URL('data/order_history.csv', ROOT), 'utf8')),
  );

  const catalog = catalogStats(catalogRows);
  const history = historyStats(historyRows, dedupeBySku(catalogRows));
  const anchors = compareAnchors(catalog, history);
  const report = renderReport(catalog, history, anchors);

  writeFileSync(new URL('docs/data-profile.md', ROOT), report);
  console.log(report);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
