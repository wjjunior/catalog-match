import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
  ThreadSystem,
} from '../domain/attributes';
import { finishFamilyOf, materialFamilyOf } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type {
  Explanation,
  MatchedAttribute,
  Note,
  NoteCode,
  PersonalizationExplanation,
} from '../domain/match';
import type {
  AttributeName,
  Diameter,
  Length,
  LengthUnit,
  ParsedSpec,
  Weighted,
} from '../domain/spec';
import { ATTRIBUTE_NAMES } from '../domain/spec';

const MATERIAL_NAMES: Readonly<Record<Material | MaterialFamily, string>> = {
  steel: 'steel',
  ss_18_8: '18-8 SS',
  ss_316: '316 SS',
  ss_a2: 'A2 SS',
  brass: 'brass',
  alloy: 'alloy',
  stainless: 'stainless',
};

/** The catalog writes HDG; a chip a rep reads at a glance spells it out. */
const FINISH_NAMES: Readonly<Record<Finish | FinishFamily, string>> = {
  zinc: 'zinc',
  yellow_zinc: 'yellow zinc',
  mech_zinc: 'mech zinc',
  hdg: 'hot-dip galvanized',
  plain: 'plain',
  black_oxide: 'black oxide',
  zinc_family: 'zinc',
};

export function formatMaterial(material: Material | MaterialFamily): string {
  return MATERIAL_NAMES[material];
}

export function formatFinish(finish: Finish | FinishFamily): string {
  return FINISH_NAMES[finish];
}

export function formatType(type: ProductType): string {
  return type.replaceAll('_', ' ');
}

/** A metric nominal already states its size; an imperial or numbered one is named by
 * nominal and pitch together, as the catalog writes it. */
export function formatDiameter(diameter: Diameter, pitch?: string): string {
  if (diameter.system === 'metric' || pitch === undefined) return diameter.nominal;
  return `${diameter.nominal}-${pitch}`;
}

const SIXTEENTHS = 16;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Inch sizes are written as fractions in this trade, and `Length` keeps only the
 * decimal, so the fraction is rebuilt over the finest step the catalog uses. */
function inches(value: number): string {
  const sixteenths = Math.round(value * SIXTEENTHS);
  if (Math.abs(value * SIXTEENTHS - sixteenths) > 1e-9) return String(value);

  const whole = Math.floor(sixteenths / SIXTEENTHS);
  const rest = sixteenths % SIXTEENTHS;
  if (rest === 0) return String(whole);

  const divisor = gcd(rest, SIXTEENTHS);
  const fraction = `${rest / divisor}/${SIXTEENTHS / divisor}`;
  return whole === 0 ? fraction : `${whole}-${fraction}`;
}

export function formatLength(length: Length): string {
  switch (length.unit) {
    case 'in':
      return `${inches(length.value)}"`;
    case 'ft':
      return `${length.value} ft`;
    case 'mm':
      return `${length.value} mm`;
  }
}

interface Agreement {
  query: string;
  item: string;
  partial: boolean;
}

function typeReading(
  readings: readonly Weighted<ProductType>[] | undefined,
  value: ProductType | undefined,
): Weighted<ProductType> | undefined {
  if (value === undefined) return undefined;
  return readings?.find((reading) => reading.value === value);
}

function has(spec: ParsedSpec, attr: AttributeName): boolean {
  switch (attr) {
    case 'diameter':
      return spec.diameter !== undefined;
    case 'pitch':
      return spec.pitch !== undefined;
    case 'length':
      return spec.length !== undefined;
    case 'type':
      return spec.type !== undefined && spec.type.length > 0;
    case 'material':
      return spec.material !== undefined;
    case 'finish':
      return spec.finish !== undefined;
    case 'standard':
      return spec.standard !== undefined;
  }
}

/** Describes agreement; it never decides it. Items outside C never reach the explainer,
 * so where this and `compatibility` could differ, C has already had the last word.
 * A contradiction (different family) returns `undefined`: not agreement, so not matched. */
function agreement(
  attr: AttributeName,
  query: ParsedSpec,
  item: ParsedSpec,
): Agreement | undefined {
  switch (attr) {
    // The pitch is part of the diameter designation (1/2-13), not a chip of its own.
    case 'pitch':
      return undefined;

    case 'diameter':
      if (query.diameter === undefined || item.diameter === undefined) return undefined;
      return {
        query: formatDiameter(query.diameter, query.pitch),
        item: formatDiameter(item.diameter, item.pitch),
        partial: false,
      };

    case 'length':
      if (query.length === undefined || item.length === undefined) return undefined;
      return {
        query: formatLength(query.length),
        item: formatLength(item.length),
        partial: false,
      };

    case 'type': {
      const itemType = item.type?.[0]?.value;
      const reading = typeReading(query.type, itemType);
      if (reading === undefined || itemType === undefined) return undefined;
      return {
        query: formatType(reading.value),
        item: formatType(itemType),
        // Several readings mean the term named a family ("HHB" is hex cap screw and tap
        // bolt); a strength below full means a weak or corrected term.
        partial: (query.type?.length ?? 0) > 1 || reading.strength < 1,
      };
    }

    case 'material': {
      if (query.material === undefined || item.material === undefined) return undefined;
      const q = query.material.value;
      const i = item.material.value;
      if (q === i) {
        return {
          query: formatMaterial(q),
          item: formatMaterial(i),
          partial: query.material.strength < 1,
        };
      }
      // Same family, different member (stainless -> 18-8 SS): a genuine partial agreement.
      // Different family (A2 -> brass): a contradiction, which is not agreement at all.
      if (materialFamilyOf(q) !== materialFamilyOf(i)) return undefined;
      return { query: formatMaterial(q), item: formatMaterial(i), partial: true };
    }

    case 'finish': {
      if (query.finish === undefined || item.finish === undefined) return undefined;
      const q = query.finish.value;
      const i = item.finish.value;
      if (q === i) {
        return {
          query: formatFinish(q),
          item: formatFinish(i),
          partial: query.finish.strength < 1,
        };
      }
      if (finishFamilyOf(q) !== finishFamilyOf(i)) return undefined;
      return { query: formatFinish(q), item: formatFinish(i), partial: true };
    }

    case 'standard':
      if (query.standard === undefined || item.standard === undefined) return undefined;
      if (query.standard !== item.standard) return undefined;
      return { query: query.standard, item: item.standard, partial: false };
  }
}

function matchedAttributes(
  query: ParsedSpec,
  item: ParsedSpec,
  relaxed: ReadonlySet<string>,
): MatchedAttribute[] {
  const matched: MatchedAttribute[] = [];

  for (const attr of ATTRIBUTE_NAMES) {
    if (relaxed.has(attr)) continue;

    const found = agreement(attr, query, item);
    if (found === undefined) continue;

    const entry: MatchedAttribute = {
      attr,
      // The query text the parser recorded, so a chip traces back to what was typed.
      query: query.evidence[attr] ?? found.query,
      item: found.item,
      provenance: query.provenance[attr] ?? 'explicit',
    };

    matched.push(found.partial ? { ...entry, partial: true } : entry);
  }

  return matched;
}

/** An attribute the item does not carry either is not a missing detail: a flat washer
 * has no length to specify. */
function unspecifiedAttributes(
  query: ParsedSpec,
  item: ParsedSpec,
  relaxed: ReadonlySet<string>,
): AttributeName[] {
  return ATTRIBUTE_NAMES.filter(
    (attr) => attr !== 'pitch' && !relaxed.has(attr) && !has(query, attr) && has(item, attr),
  );
}

export interface ExplanationMeta {
  compatibleCount: number;
  disambiguateBy: readonly AttributeName[];
}

const NOTHING_RELAXED: ReadonlySet<string> = new Set();

export function explainMatch(
  spec: ParsedSpec,
  item: CatalogItem,
  meta: ExplanationMeta,
): Explanation {
  return {
    matched: matchedAttributes(spec, item.spec, NOTHING_RELAXED),
    unspecified: unspecifiedAttributes(spec, item.spec, NOTHING_RELAXED),
    unverified: [...spec.residue],
    compatibleCount: meta.compatibleCount,
    disambiguateBy: [...meta.disambiguateBy],
  };
}

/** An alternative exists only where C is empty, so there is no compatible count to
 * report and nothing inside C to disambiguate. docs/DESIGN.md 5.6. */
export function explainAlternative(
  spec: ParsedSpec,
  item: CatalogItem,
  relaxed: readonly string[],
  closeness: number,
): Explanation {
  const dropped = new Set(relaxed);

  return {
    matched: matchedAttributes(spec, item.spec, dropped),
    unspecified: unspecifiedAttributes(spec, item.spec, dropped),
    unverified: [...spec.residue],
    compatibleCount: 0,
    disambiguateBy: [],
    relaxed: [...relaxed],
    closeness,
  };
}

/** Keeps the explanation a value: a match is explained before a customer is known, and
 * the personalization card adds its reason without reaching into this module. */
export function withPersonalization(
  explanation: Explanation,
  personalization: PersonalizationExplanation,
): Explanation {
  return { ...explanation, personalization };
}

function note(code: NoteCode, message: string): Note {
  return { code, message };
}

function list(items: readonly string[], conjunction: string): string {
  const last = items.at(-1);
  if (last === undefined) return '';
  if (items.length === 1) return last;
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${last}`;
}

function productPhrase(spec: ParsedSpec): string {
  const parts: string[] = [];
  if (spec.diameter !== undefined) parts.push(formatDiameter(spec.diameter, spec.pitch));

  const type = spec.type?.[0]?.value;
  if (type !== undefined) parts.push(formatType(type));

  return parts.join(' ');
}

function failedClause(spec: ParsedSpec, constraint: AttributeName): string {
  switch (constraint) {
    case 'length':
      return spec.length === undefined ? '' : ` at ${formatLength(spec.length)}`;
    case 'standard':
      return spec.standard === undefined ? '' : ` to ${spec.standard}`;
    case 'material':
      return spec.material === undefined ? '' : ` in ${formatMaterial(spec.material.value)}`;
    case 'finish':
      return spec.finish === undefined ? '' : ` in ${formatFinish(spec.finish.value)}`;
    // A diameter or type that emptied C is unknown to the catalog and has its own note.
    case 'diameter':
    case 'pitch':
    case 'type':
      return '';
  }
}

export function failedConstraintNote(spec: ParsedSpec, constraint: AttributeName): Note {
  return note('failedConstraint', `no ${productPhrase(spec)}${failedClause(spec, constraint)}`);
}

export function unknownDiameterNote(nominal: string): Note {
  return note('unknownDiameter', `${nominal} is not a diameter in this catalog`);
}

export function unknownTypeNote(text: string): Note {
  return note('unknownType', `${text} is not a product type in this catalog`);
}

const UNIT_WORDS: Readonly<Record<LengthUnit, string>> = {
  in: 'inches',
  ft: 'feet',
  mm: 'millimetres',
};

const SYSTEM_WORDS: Readonly<Record<ThreadSystem, string>> = {
  metric: 'metric',
  imperial: 'imperial',
  number: 'numbered',
};

function article(word: string): string {
  return /^[aeiou]/.test(word) ? 'an' : 'a';
}

export function unitMismatchNote(diameter: Diameter, length: Length): Note {
  const system = SYSTEM_WORDS[diameter.system];

  return note(
    'unitMismatch',
    `length given in ${UNIT_WORDS[length.unit]} for ${article(system)} ${system} diameter; treated as ${length.mm} mm`,
  );
}

export function discontinuedNote(sku: string): Note {
  return note('discontinued', `previously ordered ${sku} is discontinued; showing closest active`);
}

export function customerRequiredNote(phrase: string): Note {
  return note('customerRequired', `select a customer to resolve '${phrase}'`);
}

export function unresolvedReferenceNote(phrase: string): Note {
  return note('historyReference', `no earlier order matches '${phrase}'`);
}

export interface AttributeChange {
  attr: AttributeName;
  value: string;
}

export function historyReferenceNote(orderDate: string, changes: readonly AttributeChange[]): Note {
  const base = `based on your ${orderDate} order`;
  if (changes.length === 0) return note('historyReference', base);

  const phrases = changes.map((change) => `${change.attr} changed to ${change.value}`);
  return note('historyReference', `${base}, ${list(phrases, 'and')}`);
}

export function unverifiedResidueNote(tokens: readonly string[]): Note {
  return note('unverifiedResidue', `not verifiable: ${tokens.join(', ')}`);
}

export function overrideReason(preferred: readonly string[]): string {
  return `history prefers ${preferred.join(' ')}; overridden by the query`;
}

export function repeatReason(count: number, lastOrderDate: string): string {
  return `bought ${String(count)}x, last ${lastOrderDate}`;
}

/** What earns an active item part of a discontinued purchase's weight. docs/DESIGN.md 7.2. */
export function siblingReason(sku: string): string {
  return `shares diameter, type and material family with ${sku}`;
}

/** The set, not the item, is what failed: no compatible item carries the value this
 * customer buys, so the attribute contributes nothing to the ranking. */
export function unmatchedReason(attribute: AttributeName, preferred: string): string {
  return `no ${preferred} in the compatible set; ${attribute} could not be matched`;
}

export function preferenceReason(preferred: readonly string[]): string {
  return `history prefers ${preferred.join(' ')}`;
}

export function orderedReason(quantity: number, orderDate: string): string {
  return `ordered ${String(quantity)} on ${orderDate}`;
}
