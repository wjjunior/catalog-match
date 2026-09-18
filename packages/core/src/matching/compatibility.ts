import type { Finish, FinishFamily, Material, MaterialFamily } from '../domain/attributes';
import { FINISHES, FINISH_FAMILY, MATERIALS, MATERIAL_FAMILY } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { MatchStatus } from '../domain/match';
import { ATTRIBUTE_NAMES } from '../domain/spec';
import type { AttributeName, ParsedSpec } from '../domain/spec';

export type Satisfaction = 'exact' | 'family' | 'no';

interface Constraint {
  attr: AttributeName;
  satisfiedBy(item: CatalogItem): Satisfaction;
}

export interface BuildOptions {
  dropStandard?: boolean;
  widenMaterialFinish?: boolean;
  length?: 'exact' | 'approximate' | 'drop';
  lengthTolerance?: number;
}

/** Millimetres scaled to integers: two conversions of the same length must compare equal
 * even when the last bit differs. Not a tunable, so it stays out of config.ts. */
const mmKey = (mm: number): number => Math.round(mm * 1000);

const isMaterial = (value: string): value is Material =>
  (MATERIALS as readonly string[]).includes(value);

const isFinish = (value: string): value is Finish =>
  (FINISHES as readonly string[]).includes(value);

const materialFamilyOf = (value: Material | MaterialFamily): MaterialFamily =>
  isMaterial(value) ? MATERIAL_FAMILY[value] : value;

const finishFamilyOf = (value: Finish | FinishFamily): FinishFamily =>
  isFinish(value) ? FINISH_FAMILY[value] : value;

function diameterConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.diameter;
  if (!q) return undefined;
  if (!q.known) return { attr: 'diameter', satisfiedBy: () => 'no' };
  return {
    attr: 'diameter',
    satisfiedBy: (item) => {
      const i = item.spec.diameter;
      return i && i.nominal === q.nominal && i.system === q.system ? 'exact' : 'no';
    },
  };
}

function typeConstraint(spec: ParsedSpec): Constraint | undefined {
  // A type phrase the parser could not place is a constraint nothing satisfies, not an
  // absent attribute. Without this branch `carriage bolt 3/8` comes back ambiguous.
  if (spec.provenance.type === 'unrecognized') {
    return { attr: 'type', satisfiedBy: () => 'no' };
  }
  const candidates = spec.type;
  if (!candidates || candidates.length === 0) return undefined;
  return {
    attr: 'type',
    satisfiedBy: (item) =>
      candidates.some((c) => (item.spec.type ?? []).some((t) => t.value === c.value))
        ? 'exact'
        : 'no',
  };
}

function lengthConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.length;
  if (!q) return undefined;
  return {
    attr: 'length',
    satisfiedBy: (item) => {
      const i = item.spec.length;
      return i && mmKey(i.mm) === mmKey(q.mm) ? 'exact' : 'no';
    },
  };
}

function approximateLengthConstraint(spec: ParsedSpec, tolerance: number): Constraint | undefined {
  const q = spec.length;
  if (!q) return undefined;
  const window = Math.abs(q.mm) * tolerance;
  return {
    attr: 'length',
    // 'family' here means accepted-but-not-exact; only membership reads this value.
    satisfiedBy: (item) => {
      const i = item.spec.length;
      return i && Math.abs(i.mm - q.mm) <= window ? 'family' : 'no';
    },
  };
}

function materialConstraint(spec: ParsedSpec, widen: boolean): Constraint | undefined {
  const q = spec.material;
  if (!q) return undefined;
  const queryFamily = materialFamilyOf(q.value);
  return {
    attr: 'material',
    satisfiedBy: (item) => {
      const value = item.spec.material?.value;
      if (value === undefined || !isMaterial(value)) return 'no';
      if (value === q.value) return 'exact';
      if (widen) return MATERIAL_FAMILY[value] === queryFamily ? 'family' : 'no';
      return !isMaterial(q.value) && MATERIAL_FAMILY[value] === q.value ? 'family' : 'no';
    },
  };
}

function finishConstraint(spec: ParsedSpec, widen: boolean): Constraint | undefined {
  const q = spec.finish;
  if (!q) return undefined;
  const queryFamily = finishFamilyOf(q.value);
  return {
    attr: 'finish',
    satisfiedBy: (item) => {
      const value = item.spec.finish?.value;
      if (value === undefined || !isFinish(value)) return 'no';
      if (value === q.value) return 'exact';
      if (widen) return FINISH_FAMILY[value] === queryFamily ? 'family' : 'no';
      return !isFinish(q.value) && FINISH_FAMILY[value] === q.value ? 'family' : 'no';
    },
  };
}

function standardConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.standard;
  if (q === undefined) return undefined;
  return { attr: 'standard', satisfiedBy: (item) => (item.spec.standard === q ? 'exact' : 'no') };
}

/** The order of this array is the probe order of `failedConstraint`, which is what makes
 * the note read `no M8 socket head cap screw at 45 mm`. */
export function buildConstraints(spec: ParsedSpec, options: BuildOptions = {}): Constraint[] {
  const widen = options.widenMaterialFinish ?? false;
  const candidates: (Constraint | undefined)[] = [
    diameterConstraint(spec),
    typeConstraint(spec),
    options.length === 'drop'
      ? undefined
      : options.length === 'approximate'
        ? approximateLengthConstraint(spec, options.lengthTolerance ?? 0)
        : lengthConstraint(spec),
    options.dropStandard === true ? undefined : standardConstraint(spec),
    materialConstraint(spec, widen),
    finishConstraint(spec, widen),
  ];
  return candidates.filter((c): c is Constraint => c !== undefined);
}

export const bySku = (a: CatalogItem, b: CatalogItem): number =>
  a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;

export function failedConstraint(
  spec: ParsedSpec,
  items: readonly CatalogItem[],
): AttributeName | undefined {
  const active = items.filter((item) => item.active);
  if (active.length === 0) return undefined;

  let surviving: readonly CatalogItem[] = active;
  for (const constraint of buildConstraints(spec)) {
    surviving = surviving.filter((item) => constraint.satisfiedBy(item) !== 'no');
    if (surviving.length === 0) return constraint.attr;
  }
  return undefined;
}

export function compatibleSet(
  spec: ParsedSpec,
  items: readonly CatalogItem[],
): readonly CatalogItem[] {
  const constraints = buildConstraints(spec);
  return items
    .filter((item) => item.active)
    .filter((item) => constraints.every((c) => c.satisfiedBy(item) !== 'no'))
    .sort(bySku);
}

export function deriveStatus(
  spec: ParsedSpec,
  compatible: readonly CatalogItem[],
): MatchStatus {
  const hasDiameter = spec.diameter !== undefined;
  const hasType = spec.type !== undefined && spec.type.length > 0;
  if (!hasDiameter && !hasType) return 'unparsed';
  if (compatible.length === 0) return 'none';
  if (compatible.length === 1) return 'unique';
  return 'ambiguous';
}

function attributeKey(item: CatalogItem, attr: AttributeName): string {
  const s = item.spec;
  switch (attr) {
    case 'diameter':
      return s.diameter ? `${s.diameter.system}:${s.diameter.nominal}` : '';
    case 'pitch':
      return s.pitch ?? '';
    case 'length':
      return s.length ? String(mmKey(s.length.mm)) : '';
    case 'type':
      return (s.type ?? []).map((t) => t.value).join(',');
    case 'material':
      return s.material?.value ?? '';
    case 'finish':
      return s.finish?.value ?? '';
    case 'standard':
      return s.standard ?? '';
  }
}

export function disambiguateBy(compatible: readonly CatalogItem[]): AttributeName[] {
  const [first, ...rest] = compatible;
  if (!first || rest.length === 0) return [];
  return ATTRIBUTE_NAMES.filter((attr) => {
    const key = attributeKey(first, attr);
    return rest.some((item) => attributeKey(item, attr) !== key);
  });
}
