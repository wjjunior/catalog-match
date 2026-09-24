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
  | { form: 'unresolved' }
  | { form: 'pure'; lines: readonly ReferencedLine[] }
  | {
      form: 'override';
      spec: ParsedSpec;
      base: ReferencedLine;
      changed: readonly AttributeName[];
    };

const OVERRIDABLE = ['material', 'finish', 'standard', 'length'] as const;

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

function selects(query: ParsedSpec, line: ParsedSpec): boolean {
  const types = query.type?.map((entry) => entry.value);

  if (types !== undefined && line.type?.some((entry) => types.includes(entry.value)) !== true) {
    return false;
  }

  if (stated(query, 'pitch') && line.pitch !== undefined && line.pitch !== query.pitch) {
    return false;
  }

  return query.diameter === undefined || line.diameter?.nominal === query.diameter.nominal;
}

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

function inherit(base: ParsedSpec, query: ParsedSpec): ParsedSpec {
  const evidence: Partial<Record<AttributeName, string>> = {};
  const provenance: Partial<Record<AttributeName, Provenance>> = {};

  for (const attribute of ATTRIBUTE_NAMES) {
    if (attribute === 'standard' || base.provenance[attribute] === undefined) continue;

    provenance[attribute] = 'inferred';
    const quoted = base.evidence[attribute];
    if (quoted !== undefined) evidence[attribute] = quoted;
  }

  const threaded = stated(query, 'pitch') && query.diameter !== undefined;

  if (threaded) {
    provenance.diameter = query.provenance.diameter;
    provenance.pitch = query.provenance.pitch;
    evidence.diameter = query.evidence.diameter;
    evidence.pitch = query.evidence.pitch;
  }

  return {
    diameter: threaded ? query.diameter : base.diameter,
    pitch: threaded ? query.pitch : base.pitch,
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

export function resolveReference(
  lines: readonly HistoryLine[] | undefined,
  spec: ParsedSpec,
  config: MatcherConfig,
): HistoryReference {
  if (lines === undefined) return { form: 'needsCustomer' };

  const selected = select(lines, spec);
  const base = selected[0];

  if (base === undefined) return { form: 'unresolved' };

  if (!statesOverride(spec)) {
    return { form: 'pure', lines: selected.map((entry, rank) => referenced(entry, rank, config)) };
  }

  const merged = inherit(base.spec, spec);
  const changed = overwrite(merged, spec);

  return { form: 'override', spec: merged, base: referenced(base, 0, config), changed };
}
