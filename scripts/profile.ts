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
