import type { Finish, FinishFamily, Material, MaterialFamily } from '../domain/attributes';
import { FINISHES, FINISH_FAMILY, MATERIALS, MATERIAL_FAMILY } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { MatchStatus } from '../domain/match';
import { ATTRIBUTE_NAMES } from '../domain/spec';
import type { AttributeName, ParsedSpec } from '../domain/spec';
import type { BackoffStep, MatcherConfig } from './config';

interface Constraint {
  attr: AttributeName;
  satisfiedBy(item: CatalogItem): boolean;
}

interface BuildOptions {
  dropStandard?: boolean;
  widenMaterialFinish?: boolean;
  length?: 'exact' | 'approximate' | 'drop';
  lengthTolerance?: number;
}

/** Millimetres scaled to integers: two conversions of the same length must compare equal
 * even when the last bit differs. Not a tunable, so it stays out of config.ts. */
const mmKey = (mm: number): number => Math.round(mm * 1000);

/** The one rule for two lengths being the same length. Ranking reads it from here rather
 * than keeping a second one: a length the ranker judges differently is an item C admitted
 * and ranking then refuses, which is a throw, not a low score. */
export const sameLength = (a: number, b: number): boolean => mmKey(a) === mmKey(b);

const isMaterial = (value: string): value is Material =>
  (MATERIALS as readonly string[]).includes(value);

const isFinish = (value: string): value is Finish =>
  (FINISHES as readonly string[]).includes(value);

const widensMaterial = (value: Material): boolean =>
  MATERIALS.some((m) => m !== value && MATERIAL_FAMILY[m] === MATERIAL_FAMILY[value]);

const widensFinish = (value: Finish): boolean =>
  FINISHES.some((f) => f !== value && FINISH_FAMILY[f] === FINISH_FAMILY[value]);

const materialFamilyOf = (value: Material | MaterialFamily): MaterialFamily =>
  isMaterial(value) ? MATERIAL_FAMILY[value] : value;

const finishFamilyOf = (value: Finish | FinishFamily): FinishFamily =>
  isFinish(value) ? FINISH_FAMILY[value] : value;

function diameterConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.diameter;
  if (!q) return undefined;
  if (!q.known) return { attr: 'diameter', satisfiedBy: () => false };
  return {
    attr: 'diameter',
    satisfiedBy: (item) => {
      const i = item.spec.diameter;
      return i !== undefined && i.nominal === q.nominal && i.system === q.system;
    },
  };
}

function typeConstraint(spec: ParsedSpec): Constraint | undefined {
  // A type phrase the parser could not place is a constraint nothing satisfies, not an
  // absent attribute. Without this branch `carriage bolt 3/8` comes back ambiguous.
  if (spec.provenance.type === 'unrecognized') {
    return { attr: 'type', satisfiedBy: () => false };
  }
  const candidates = spec.type;
  if (!candidates || candidates.length === 0) return undefined;
  return {
    attr: 'type',
    satisfiedBy: (item) =>
      candidates.some((c) => (item.spec.type ?? []).some((t) => t.value === c.value)),
  };
}

function lengthConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.length;
  if (!q) return undefined;
  return {
    attr: 'length',
    satisfiedBy: (item) => {
      const i = item.spec.length;
      return i !== undefined && sameLength(i.mm, q.mm);
    },
  };
}

function approximateLengthConstraint(spec: ParsedSpec, tolerance: number): Constraint | undefined {
  const q = spec.length;
  if (!q) return undefined;
  const window = Math.abs(q.mm) * tolerance;
  return {
    attr: 'length',
    satisfiedBy: (item) => {
      const i = item.spec.length;
      return i !== undefined && Math.abs(i.mm - q.mm) <= window;
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
      if (value === undefined || !isMaterial(value)) return false;
      if (value === q.value) return true;
      if (widen) return MATERIAL_FAMILY[value] === queryFamily;
      return !isMaterial(q.value) && MATERIAL_FAMILY[value] === q.value;
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
      if (value === undefined || !isFinish(value)) return false;
      if (value === q.value) return true;
      if (widen) return FINISH_FAMILY[value] === queryFamily;
      return !isFinish(q.value) && FINISH_FAMILY[value] === q.value;
    },
  };
}

function standardConstraint(spec: ParsedSpec): Constraint | undefined {
  const q = spec.standard;
  if (q === undefined) return undefined;
  return { attr: 'standard', satisfiedBy: (item) => item.spec.standard === q };
}

/** The order of this array is the probe order of `failedConstraint`, which is what makes
 * the note read `no M8 socket head cap screw at 45 mm`. */
function buildConstraints(spec: ParsedSpec, options: BuildOptions = {}): Constraint[] {
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

const bySku = (a: CatalogItem, b: CatalogItem): number =>
  a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;

export function failedConstraint(
  spec: ParsedSpec,
  items: readonly CatalogItem[],
): AttributeName | undefined {
  const active = items.filter((item) => item.active);
  if (active.length === 0) return undefined;

  let surviving: readonly CatalogItem[] = active;
  for (const constraint of buildConstraints(spec)) {
    surviving = surviving.filter((item) => constraint.satisfiedBy(item));
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
    .filter((item) => constraints.every((c) => c.satisfiedBy(item)))
    .sort(bySku);
}

export function deriveStatus(spec: ParsedSpec, compatible: readonly CatalogItem[]): MatchStatus {
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

export interface AlternativeCandidate {
  item: CatalogItem;
  closeness: number;
  relaxed: string[];
}

function applyStep(
  step: BackoffStep,
  spec: ParsedSpec,
  options: BuildOptions,
  relaxed: string[],
  config: MatcherConfig,
): void {
  switch (step) {
    case 'standard':
      options.dropStandard = true;
      if (spec.standard !== undefined) relaxed.push('standard');
      return;
    case 'materialFinishFamily':
      options.widenMaterialFinish = true;
      // A singleton family widens to nothing, so only a family with siblings counts as relaxed.
      if (spec.material && isMaterial(spec.material.value) && widensMaterial(spec.material.value))
        relaxed.push('material');
      if (spec.finish && isFinish(spec.finish.value) && widensFinish(spec.finish.value))
        relaxed.push('finish');
      return;
    case 'approximateLength':
      options.length = 'approximate';
      options.lengthTolerance = config.lengthTolerance;
      if (spec.length !== undefined) relaxed.push('length');
      return;
    case 'dropLength':
      options.length = 'drop';
      return;
  }
}

function rankByLengthDistance(
  found: readonly CatalogItem[],
  spec: ParsedSpec,
): readonly CatalogItem[] {
  const target = spec.length?.mm;
  if (target === undefined) return [...found].sort(bySku);
  const distance = (item: CatalogItem): number =>
    item.spec.length === undefined
      ? Number.POSITIVE_INFINITY
      : Math.abs(item.spec.length.mm - target);
  return [...found].sort((a, b) => distance(a) - distance(b) || bySku(a, b));
}

export function alternatives(
  spec: ParsedSpec,
  items: readonly CatalogItem[],
  config: MatcherConfig,
): readonly AlternativeCandidate[] {
  const failed = failedConstraint(spec, items);
  if (failed === undefined || failed === 'diameter' || failed === 'type') return [];

  const specified = buildConstraints(spec).length;

  const active = items.filter((item) => item.active);
  const options: BuildOptions = {};
  const relaxed: string[] = [];

  for (const step of config.backoffOrder) {
    applyStep(step, spec, options, relaxed, config);
    const constraints = buildConstraints(spec, options);
    const found = active.filter((item) => constraints.every((c) => c.satisfiedBy(item)));
    if (found.length > 0) {
      const closeness = (specified - relaxed.length) / specified;
      return rankByLengthDistance(found, spec).map((item) => ({
        item,
        closeness,
        relaxed: [...relaxed],
      }));
    }
  }
  return [];
}
