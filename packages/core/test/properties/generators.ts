import fc from 'fast-check';

import type { Finish, Material, ProductType, Standard } from '../../src/domain/attributes';
import { FINISHES, MATERIALS, STANDARDS } from '../../src/domain/attributes';
import type { CatalogItem } from '../../src/domain/catalog';
import type { AttributeName, Length } from '../../src/domain/spec';
import { formatLength } from '../../src/matching/explainer';
import { toInches, toMm } from '../../src/parsing/units';

/** Spellings of one attribute value. Every variant names the same single value at full
 * strength, so a query rendered with one is the same request as with another; a term that
 * widens the reading (`washer` is flat and lock, `hex bolt` is cap screw and tap bolt) or
 * that costs strength is not a spelling of anything and is absent. */
export interface Spellings {
  readonly canonical: string;
  readonly variants: readonly string[];
}

export const TYPE_TERMS: Readonly<Record<ProductType, Spellings>> = {
  hex_cap_screw: {
    canonical: 'hex cap screw',
    variants: ['hhcs', 'hx cap scr', 'hex cap scr', 'hx cap screw', 'hex head cap screw'],
  },
  socket_head_cap_screw: {
    canonical: 'socket head cap screw',
    variants: ['shcs', 'soc head', 'allen head', 'socket head', 'soc head cap screw'],
  },
  button_socket_cap_screw: {
    canonical: 'button socket cap screw',
    variants: ['bhcs', 'btn', 'button head', 'button socket', 'btn soc cap scr'],
  },
  pan_machine_screw: {
    canonical: 'phillips pan machine screw',
    variants: ['pms', 'pan head', 'phil pan', 'pan head machine screw', 'phil pan mach scr'],
  },
  lag_screw: {
    canonical: 'lag screw',
    variants: ['lag', 'hex lag', 'lag scr', 'lag bolt', 'hex hd lag screw'],
  },
  tap_bolt: { canonical: 'tap bolt', variants: ['tap screw', 'full thread hex bolt'] },
  threaded_rod: {
    canonical: 'threaded rod',
    variants: ['atr', 'rod', 'allthread', 'all thread', 'full thread rod'],
  },
  hex_nut: { canonical: 'hex nut', variants: ['hn', 'nut', 'hx nut', 'finished hex nut'] },
  flat_washer: { canonical: 'flat washer', variants: ['fw', 'flat wshr'] },
  lock_washer: {
    canonical: 'lock washer',
    variants: ['lw', 'lock wshr', 'split washer', 'spring washer', 'split lock washer'],
  },
};

export const MATERIAL_TERMS: Readonly<Record<Material, Spellings>> = {
  steel: { canonical: 'steel', variants: [] },
  ss_18_8: { canonical: '18-8 ss', variants: ['304', '18-8', 'ss 304'] },
  ss_316: { canonical: '316 ss', variants: ['316', 'a4'] },
  ss_a2: { canonical: 'a2 ss', variants: ['a2'] },
  brass: { canonical: 'brass', variants: [] },
  alloy: { canonical: 'alloy steel', variants: ['alloy'] },
};

export const FINISH_TERMS: Readonly<Record<Finish, Spellings>> = {
  zinc: { canonical: 'zinc', variants: ['zn', 'zp', 'zinc plated'] },
  yellow_zinc: {
    canonical: 'yellow zinc',
    variants: ['yz', 'yel zn', 'yel zinc', 'yellow zn'],
  },
  mech_zinc: { canonical: 'mech zinc', variants: ['mech zn', 'mechanical zinc'] },
  hdg: { canonical: 'galvanized', variants: ['hdg', 'galv', 'hot dip', 'hot dipped'] },
  plain: { canonical: 'plain', variants: ['pln', 'bare', 'uncoated'] },
  black_oxide: { canonical: 'black oxide', variants: ['blk oxide'] },
};

export const STANDARD_TERMS: Readonly<Record<Standard, Spellings>> = {
  'ASME B18.2.1': { canonical: 'asme b18.2.1', variants: ['b18.2.1'] },
  'DIN 912': { canonical: 'din 912', variants: ['din912'] },
  'DIN 933': { canonical: 'din 933', variants: ['din933'] },
  'ISO 7380': { canonical: 'iso 7380', variants: ['iso7380'] },
  'IFI 111': { canonical: 'ifi 111', variants: ['ifi111'] },
  'ASTM A307': { canonical: 'astm a307', variants: ['a307'] },
  'CLASS 8': { canonical: 'class 8', variants: [] },
};

export interface Typo {
  readonly word: string;
  readonly typo: string;
}

/** One edit from a word the lexicon knows, applied only to a word already in the query.
 * Each pair is pinned rather than generated: a misspelling that corrects to a different
 * word is a different request, not a typo. */
export const TYPOS: readonly Typo[] = [
  { word: 'washer', typo: 'washr' },
  { word: 'washer', typo: 'wahser' },
  { word: 'screw', typo: 'srew' },
  { word: 'screw', typo: 'screww' },
  { word: 'socket', typo: 'sockett' },
  { word: 'head', typo: 'haed' },
  { word: 'flat', typo: 'flatt' },
  { word: 'phillips', typo: 'phillps' },
  { word: 'machine', typo: 'machien' },
  { word: 'stainless', typo: 'stainlesss' },
  { word: 'zinc', typo: 'zincc' },
  { word: 'galvanized', typo: 'galvanised' },
  { word: 'bolt', typo: 'bolot' },
  { word: 'nut', typo: 'nutt' },
];

/** Words a request arrives wrapped in. None is a lexicon term and none is one edit from
 * one, so noise never becomes an attribute. Numbers are absent because a bare number next
 * to a size is a length, and so are the quantity words: `pcs` next to the 933 of DIN 933
 * makes it a count, which is a different request rather than the same one with noise. */
export const NOISE: readonly string[] = [
  'please',
  'quote',
  'need',
  'want',
  'asap',
  'urgent',
  'thanks',
  'rush',
  'today',
  'shop',
  'stock',
  'project',
  'job',
];

export type Spelling = 'canonical' | 'variant';

/** `own` is the unit the catalog states, `decimal` the same unit written out, `bare` the
 * number alone (the diameter's system supplies the unit), `foreign` the other system. */
export type LengthForm = 'own' | 'decimal' | 'bare' | 'foreign';

export type Segment = 'size' | 'type' | 'material' | 'finish' | 'standard';

export const SEGMENTS: readonly Segment[] = ['size', 'type', 'material', 'finish', 'standard'];

export interface QueryPlan {
  readonly diameter: boolean;
  readonly length: boolean;
  readonly type: boolean;
  readonly material: boolean;
  readonly finish: boolean;
  readonly standard: boolean;
  readonly order: readonly Segment[];
  readonly pitch: boolean;
  readonly lengthForm: LengthForm;
  readonly variant: number;
  readonly upper: boolean;
  readonly lead: readonly string[];
  readonly trail: readonly string[];
  readonly typo: number;
}

/** The catalog parser is strict, so a catalog item always holds a concrete value; the
 * query parser is the one that may read a family, and no item is generated from one. */
const isMaterial = (value: string): value is Material =>
  (MATERIALS as readonly string[]).includes(value);

const isFinish = (value: string): value is Finish =>
  (FINISHES as readonly string[]).includes(value);

const isStandard = (value: string): value is Standard =>
  (STANDARDS as readonly string[]).includes(value);

function pick(spellings: Spellings, plan: QueryPlan, spelling: Spelling): string {
  const { variants } = spellings;
  if (spelling === 'canonical' || variants.length === 0) return spellings.canonical;

  return variants[plan.variant % variants.length] ?? spellings.canonical;
}

function renderLength(length: Length, form: LengthForm): string {
  switch (form) {
    case 'own':
      return formatLength(length);
    case 'decimal':
      return `${String(length.value)} ${length.unit}`;
    // A foot length has no bare form: a whole number takes the diameter's system, and 6
    // would be read as six inches.
    case 'bare':
      return length.unit === 'ft' ? `${String(length.value)} ft` : String(length.value);
    case 'foreign':
      return length.unit === 'mm'
        ? `${String(toInches(length.value, 'mm'))} in`
        : `${String(toMm(length.value, length.unit))}mm`;
  }
}

function sizeSegment(item: CatalogItem, plan: QueryPlan): string {
  const { diameter, length, pitch } = item.spec;
  const parts: string[] = [];

  if (plan.diameter && diameter !== undefined) {
    parts.push(
      plan.pitch && pitch !== undefined ? `${diameter.nominal}-${pitch}` : diameter.nominal,
    );
  }

  // A length is written after the diameter it belongs to. On its own it would not be a
  // length at all: a leading `20 mm` is the metric diameter M20. docs/DESIGN.md 5.2.
  if (plan.length && length !== undefined && parts.length === 1) {
    parts.push(`x ${renderLength(length, plan.lengthForm)}`);
  }

  return parts.join(' ');
}

function segment(item: CatalogItem, plan: QueryPlan, spelling: Spelling, name: Segment): string {
  const { spec } = item;

  switch (name) {
    case 'size':
      return sizeSegment(item, plan);
    case 'type': {
      const value = spec.type?.[0]?.value;
      return plan.type && value !== undefined ? pick(TYPE_TERMS[value], plan, spelling) : '';
    }
    case 'material': {
      const value = spec.material?.value;
      return plan.material && value !== undefined && isMaterial(value)
        ? pick(MATERIAL_TERMS[value], plan, spelling)
        : '';
    }
    case 'finish': {
      const value = spec.finish?.value;
      return plan.finish && value !== undefined && isFinish(value)
        ? pick(FINISH_TERMS[value], plan, spelling)
        : '';
    }
    case 'standard': {
      const value = spec.standard;
      return plan.standard && value !== undefined && isStandard(value)
        ? pick(STANDARD_TERMS[value], plan, spelling)
        : '';
    }
  }
}

/** The one typo of the plan, applied only where the word it misspells is actually there. */
function misspell(query: string, plan: QueryPlan): string {
  const entry = TYPOS[plan.typo];
  if (entry === undefined) return query;

  const words = query.split(' ');
  const at = words.indexOf(entry.word);
  if (at === -1) return query;

  return [...words.slice(0, at), entry.typo, ...words.slice(at + 1)].join(' ');
}

export function render(item: CatalogItem, plan: QueryPlan, spelling: Spelling): string {
  const body = plan.order
    .map((name) => segment(item, plan, spelling, name))
    .filter((s) => s !== '');
  const query = [...plan.lead, ...body, ...plan.trail].join(' ');
  const spelled = misspell(query, plan);

  return plan.upper ? spelled.toUpperCase() : spelled;
}

/** The attributes the rendering actually states, which is what the plan asks for narrowed
 * to what the item carries. `pitch` rides along with the diameter and is never a segment. */
export function stated(item: CatalogItem, plan: QueryPlan): readonly AttributeName[] {
  const { spec } = item;
  const names: AttributeName[] = [];

  if (plan.diameter && spec.diameter !== undefined) names.push('diameter');
  if (plan.length && spec.length !== undefined) names.push('length');
  if (plan.type && spec.type?.[0] !== undefined) names.push('type');
  if (plan.material && spec.material !== undefined) names.push('material');
  if (plan.finish && spec.finish !== undefined) names.push('finish');
  if (plan.standard && spec.standard !== undefined) names.push('standard');

  return names;
}

interface PlanOptions {
  /** Every stated attribute is rendered at full strength: no typo, and no length pushed
   * through a conversion that loses precision. */
  readonly exact?: boolean;
}

/** A plan the grammar can actually render: the length rides on the diameter, and a
 * request that names neither a diameter nor a type is not a request for a product. */
const viable = (plan: QueryPlan, named: boolean): QueryPlan => {
  const withDiameter = plan.length ? { ...plan, diameter: true } : plan;
  if (!named || withDiameter.diameter || withDiameter.type) return withDiameter;

  return { ...withDiameter, type: true };
};

function planArbitrary(options: PlanOptions): fc.Arbitrary<QueryPlan> {
  const exact = options.exact === true;

  return fc.record({
    diameter: fc.boolean(),
    length: fc.boolean(),
    type: fc.boolean(),
    material: fc.boolean(),
    finish: fc.boolean(),
    standard: fc.boolean(),
    order: fc.shuffledSubarray([...SEGMENTS], { minLength: SEGMENTS.length }),
    pitch: fc.boolean(),
    lengthForm: exact
      ? fc.constantFrom<LengthForm>('own', 'decimal', 'bare')
      : fc.constantFrom<LengthForm>('own', 'decimal', 'bare', 'foreign'),
    variant: fc.nat({ max: 8 }),
    upper: fc.boolean(),
    lead: fc.subarray([...NOISE], { maxLength: 1 }),
    trail: fc.subarray([...NOISE], { maxLength: 2 }),
    // Any index past the table is "no typo", which keeps most queries clean.
    typo: exact ? fc.constant(TYPOS.length) : fc.nat({ max: TYPOS.length * 2 }),
  });
}

export interface GeneratedQuery {
  readonly item: CatalogItem;
  readonly plan: QueryPlan;
  readonly query: string;
  readonly stated: readonly AttributeName[];
}

const build = (item: CatalogItem, plan: QueryPlan, spelling: Spelling): GeneratedQuery => ({
  item,
  plan,
  query: render(item, plan, spelling),
  stated: stated(item, plan),
});

/** A query over the catalog's own grammar: a real item, a subset of its attributes in a
 * random order and spelling, with noise, unit forms and typos. */
export function queries(items: readonly CatalogItem[]): fc.Arbitrary<GeneratedQuery> {
  return fc
    .tuple(
      fc.constantFrom(...items),
      planArbitrary({}),
      fc.constantFrom<Spelling>('canonical', 'variant'),
    )
    .map(([item, plan, spelling]) => build(item, viable(plan, false), spelling));
}

/** The same, narrowed to what docs/DESIGN.md 5.3 promises to place in C: every stated
 * attribute exact, and a diameter or a type so the parse is not `unparsed`. */
export function exactQueries(items: readonly CatalogItem[]): fc.Arbitrary<GeneratedQuery> {
  return fc
    .tuple(
      fc.constantFrom(...items),
      planArbitrary({ exact: true }),
      fc.constantFrom<Spelling>('canonical', 'variant'),
    )
    .map(([item, plan, spelling]) => build(item, viable(plan, true), spelling));
}

export interface SpellingPair {
  readonly item: CatalogItem;
  readonly canonical: string;
  readonly variant: string;
}

/** One request written twice: the catalog's spelling and the rep's. Typos are absent
 * because a correction costs strength, which the canonical spelling does not pay. */
export function spellingPairs(items: readonly CatalogItem[]): fc.Arbitrary<SpellingPair> {
  return fc
    .tuple(fc.constantFrom(...items), planArbitrary({ exact: true }))
    .map(([item, drawn]) => {
      const plan = viable(drawn, true);

      return {
        item,
        canonical: render(item, plan, 'canonical'),
        variant: render(item, plan, 'variant'),
      };
    });
}

/** Known ids, unknown ids and no customer at all: the three cases the response must
 * treat the same way as far as the compatible set is concerned. */
export function customers(known: readonly string[]): fc.Arbitrary<string | undefined> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constantFrom(...known),
    fc.constantFrom('CUST-999', 'CUST-000', 'nobody'),
  );
}
