import type { HistoryLine } from '../domain/catalog';
import {
  ATTRIBUTE_NAMES,
  type AttributeName,
  type ParsedSpec,
  type Provenance,
} from '../domain/spec';
import type { MatcherConfig } from '../matching/config';
import { parseDescription } from '../parsing/descriptionParser';

export interface ReferencedLine {
  sku: string;
  description: string;
  orderDate: string;
  quantity: number;
  confidence: number;
}

export type HistoryReference =
  | { form: 'needsCustomer' }
  | { form: 'pure'; lines: readonly ReferencedLine[] }
  | {
      form: 'override';
      spec: ParsedSpec;
      base: ReferencedLine;
      changed: readonly AttributeName[];
    };

/** Diameter, pitch and type choose which orders the reference names; anything else the
 * query states is a change it asks for. docs/DESIGN.md 7.4. */
const OVERRIDABLE = ['material', 'finish', 'standard', 'length'] as const;

/** True when the query asks for something the referenced order cannot supply, which is
 * what separates an override from a reference that only names which orders it means. */
export function statesOverride(spec: ParsedSpec): boolean {
  return OVERRIDABLE.some((attribute) => stated(spec, attribute));
}

interface Selected {
  line: HistoryLine;
  spec: ParsedSpec;
}

function stated(spec: ParsedSpec, attribute: AttributeName): boolean {
  const provenance = spec.provenance[attribute];

  return provenance === 'explicit' || provenance === 'corrected';
}

function compare(left: string, right: string): number {
  if (left === right) return 0;

  return left < right ? -1 : 1;
}

/** Every selector the query states must hold; a query that states none names the whole
 * history, which is what `reorder` on its own asks for. */
function selects(query: ParsedSpec, line: ParsedSpec): boolean {
  const types = query.type?.map((entry) => entry.value);

  if (types !== undefined && line.type?.some((entry) => types.includes(entry.value)) !== true) {
    return false;
  }

  return query.diameter === undefined || line.diameter?.nominal === query.diameter.nominal;
}

/** One entry per SKU at its latest order, most recent first. A line the parser cannot read
 * cannot be held against the query, so it is dropped rather than guessed at. */
function select(lines: readonly HistoryLine[], query: ParsedSpec): Selected[] {
  const latest = new Map<string, Selected>();

  for (const line of lines) {
    let spec: ParsedSpec;
    try {
      spec = parseDescription(line.description);
    } catch {
      continue;
    }

    if (!selects(query, spec)) continue;

    const seen = latest.get(line.sku);
    if (seen === undefined || line.orderDate > seen.line.orderDate) {
      latest.set(line.sku, { line, spec });
    }
  }

  // Stable, so SKUs that tie on the date keep the order the file first mentions them in.
  return [...latest.values()].sort((a, b) => compare(b.line.orderDate, a.line.orderDate));
}

function referenced({ line }: Selected, rank: number, config: MatcherConfig): ReferencedLine {
  return {
    sku: line.sku,
    description: line.description,
    orderDate: line.orderDate,
    quantity: line.quantity,
    confidence: config.historyConfidence * config.historyDecayPerRank ** rank,
  };
}

/** The referenced order read as a specification, minus its standard: the standard belongs
 * to the SKU the customer happened to buy, and keeping it would leave `but brass` with
 * nothing to match. Nothing here was asked for, so none of it is explicit. */
function inherit(base: ParsedSpec, query: ParsedSpec): ParsedSpec {
  const evidence: Partial<Record<AttributeName, string>> = {};
  const provenance: Partial<Record<AttributeName, Provenance>> = {};

  for (const attribute of ATTRIBUTE_NAMES) {
    if (attribute === 'standard' || base.provenance[attribute] === undefined) continue;

    provenance[attribute] = 'inferred';
    const quoted = base.evidence[attribute];
    if (quoted !== undefined) evidence[attribute] = quoted;
  }

  return {
    diameter: base.diameter,
    pitch: base.pitch,
    length: base.length,
    type: base.type,
    material: base.material,
    finish: base.finish,
    residue: [...query.residue],
    evidence,
    provenance,
  };
}

function overwrite(merged: ParsedSpec, query: ParsedSpec): AttributeName[] {
  const changed: AttributeName[] = [];

  const take = (
    attribute: (typeof OVERRIDABLE)[number],
    differs: boolean,
    assign: () => void,
  ): void => {
    if (!stated(query, attribute)) return;

    assign();
    merged.provenance[attribute] = query.provenance[attribute];
    merged.evidence[attribute] = query.evidence[attribute];
    if (differs) changed.push(attribute);
  };

  take('material', query.material?.value !== merged.material?.value, () => {
    merged.material = query.material;
  });
  take('finish', query.finish?.value !== merged.finish?.value, () => {
    merged.finish = query.finish;
  });
  take('standard', query.standard !== merged.standard, () => {
    merged.standard = query.standard;
  });
  take('length', query.length?.mm !== merged.length?.mm, () => {
    merged.length = query.length;
  });

  return changed;
}

/** `lines` are one customer's orders; `undefined` means no customer is selected, which is
 * not the same as a customer who has never ordered. docs/DESIGN.md 7.4. */
export function resolveReference(
  lines: readonly HistoryLine[] | undefined,
  spec: ParsedSpec,
  config: MatcherConfig,
): HistoryReference {
  if (lines === undefined) return { form: 'needsCustomer' };

  const selected = select(lines, spec);
  const base = selected[0];

  if (base === undefined || !statesOverride(spec)) {
    return { form: 'pure', lines: selected.map((entry, rank) => referenced(entry, rank, config)) };
  }

  const merged = inherit(base.spec, spec);
  const changed = overwrite(merged, spec);

  return { form: 'override', spec: merged, base: referenced(base, 0, config), changed };
}
