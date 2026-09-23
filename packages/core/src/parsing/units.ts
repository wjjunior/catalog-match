import type { ThreadSystem } from '../domain/attributes';
import { DIAMETERS } from '../domain/diameters';
import type { Diameter, Length, LengthUnit } from '../domain/spec';

const MM_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

/** The diameter table stores rounded millimetres (19.05, 11.1125, 4.1656), so every
 * conversion rounds to the same precision or a parsed length never equals a catalog one. */
function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

const MIXED = /^(\d+)-(\d+)\/(\d+)$/;
const FRACTION = /^(\d+)\/(\d+)$/;
const PLAIN = /^\d+(?:\.\d+)?$/;

/** A digit run long enough to overflow Number.MAX_VALUE parses "successfully" to
 * Infinity (or NaN once divided); undefined for that the same as undefined for `1/0`. */
export function parseNumber(text: string): number | undefined {
  const mixed = MIXED.exec(text);
  if (mixed) {
    const [, whole = '', numerator = '', denominator = ''] = mixed;
    if (Number(denominator) === 0) return undefined;
    const value = Number(whole) + Number(numerator) / Number(denominator);
    return Number.isFinite(value) ? value : undefined;
  }

  const fraction = FRACTION.exec(text);
  if (fraction) {
    const [, numerator = '', denominator = ''] = fraction;
    if (Number(denominator) === 0) return undefined;
    const value = Number(numerator) / Number(denominator);
    return Number.isFinite(value) ? value : undefined;
  }

  if (!PLAIN.test(text)) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

export type SizeToken =
  | { kind: 'thread'; nominal: string; pitch?: string }
  | { kind: 'length'; value: number; unit?: LengthUnit };

const MIN_TPI = 4;
const MAX_TPI = 80;

const UNIT_SUFFIX = /^(.*?)\s*("|in|ft|mm)$/i;
const METRIC_THREAD = /^m(\d+)(?:-(\d+(?:\.\d+)?))?$/i;
const NUMBERED_THREAD = /^#(\d+)(?:-(\d+))?$/;
const FRACTION_THREAD = /^(\d+\/\d+)(?:-(\d+))?$/;

const UNITS: Readonly<Record<string, LengthUnit>> = {
  '"': 'in',
  in: 'in',
  ft: 'ft',
  mm: 'mm',
};

/** Guards the imperial and numbered forms only: a metric pitch is a millimetre figure
 * (1.25, 0.7) and would fail every threads-per-inch bound. */
function plausibleTpi(pitch: string | undefined): boolean {
  if (pitch === undefined) return true;
  const tpi = Number(pitch);
  return tpi >= MIN_TPI && tpi <= MAX_TPI;
}

function thread(nominal: string, pitch: string | undefined): SizeToken {
  return pitch === undefined ? { kind: 'thread', nominal } : { kind: 'thread', nominal, pitch };
}

/** Shape decides, not a lookup: FRACTION_THREAD cannot match `integer-fraction`, so a
 * mixed number falls through to a length and 1/2-20 stays a thread with a foreign pitch. */
export function classifySizeToken(text: string): SizeToken | undefined {
  const token = text.trim();
  if (token === '') return undefined;

  const withUnit = UNIT_SUFFIX.exec(token);
  if (withUnit) {
    const [, numberText = '', unitText = ''] = withUnit;
    const value = parseNumber(numberText);
    const unit = UNITS[unitText.toLowerCase()];
    return value === undefined || unit === undefined ? undefined : { kind: 'length', value, unit };
  }

  const metric = METRIC_THREAD.exec(token);
  if (metric) {
    const [, digits = '', pitch] = metric;
    return thread(`M${digits}`, pitch);
  }

  const numbered = NUMBERED_THREAD.exec(token);
  if (numbered) {
    const [, digits = '', pitch] = numbered;
    return plausibleTpi(pitch) ? thread(`#${digits}`, pitch) : undefined;
  }

  const fraction = FRACTION_THREAD.exec(token);
  if (fraction) {
    const [, nominal = '', pitch] = fraction;
    return plausibleTpi(pitch) ? thread(nominal, pitch) : undefined;
  }

  const value = parseNumber(token);
  return value === undefined ? undefined : { kind: 'length', value };
}

const NUMBERED_BASE_INCHES = 0.06;
const NUMBERED_STEP_INCHES = 0.013;

function systemOf(nominal: string): ThreadSystem {
  if (nominal.startsWith('M')) return 'metric';
  return nominal.startsWith('#') ? 'number' : 'imperial';
}

function diameterMm(nominal: string, system: ThreadSystem): number | undefined {
  if (system === 'metric') return Number(nominal.slice(1));
  if (system === 'number') {
    return toMm(NUMBERED_BASE_INCHES + NUMBERED_STEP_INCHES * Number(nominal.slice(1)), 'in');
  }
  const inches = parseNumber(nominal);
  return inches === undefined ? undefined : toMm(inches, 'in');
}

/** An unknown nominal still carries millimetres: it must reach the null hypothesis as a
 * real size, not be dropped. docs/DESIGN.md 5.2. */
export function resolveDiameter(nominal: string): Diameter | undefined {
  const token = classifySizeToken(nominal);
  if (token?.kind !== 'thread' || token.pitch !== undefined) return undefined;

  const system = systemOf(token.nominal);
  const mm = diameterMm(token.nominal, system);
  if (mm === undefined || !Number.isFinite(mm)) return undefined;

  return {
    system,
    nominal: token.nominal,
    mm,
    known: DIAMETERS.some((spec) => spec.nominal === token.nominal),
  };
}

export function toMm(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return round(value);
    case 'in':
      return round(value * MM_PER_INCH);
    case 'ft':
      return round(value * INCHES_PER_FOOT * MM_PER_INCH);
  }
}

export function toInches(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'in':
      return round(value);
    case 'ft':
      return round(value * INCHES_PER_FOOT);
    case 'mm':
      return round(value / MM_PER_INCH);
  }
}

export interface ResolvedLength {
  length: Length;
  provenance: 'explicit' | 'inferred';
}

/** A stated unit is explicit; every other unit here comes from a rule, so it is inferred.
 * A whole number with no diameter to inherit from stays unresolved rather than guessing. */
export function resolveLength(token: SizeToken, diameter?: Diameter): ResolvedLength | undefined {
  if (token.kind !== 'length') return undefined;

  if (token.unit !== undefined) {
    const mm = toMm(token.value, token.unit);
    if (!Number.isFinite(token.value) || !Number.isFinite(mm)) return undefined;
    return {
      length: { value: token.value, unit: token.unit, mm },
      provenance: 'explicit',
    };
  }

  const unit = inferUnit(token.value, diameter);
  if (unit === undefined) return undefined;

  const mm = toMm(token.value, unit);
  if (!Number.isFinite(token.value) || !Number.isFinite(mm)) return undefined;

  return {
    length: { value: token.value, unit, mm },
    provenance: 'inferred',
  };
}

function inferUnit(value: number, diameter: Diameter | undefined): LengthUnit | undefined {
  if (!Number.isInteger(value)) return 'in';
  if (diameter === undefined) return undefined;
  return diameter.system === 'metric' ? 'mm' : 'in';
}

export function unitMismatch(diameter: Diameter, length: Length): boolean {
  return diameter.system === 'metric' ? length.unit !== 'mm' : length.unit === 'mm';
}

/** Tolerance is a fraction of the requested value, not an absolute distance:
 * "within 25% of the requested value after unit conversion". docs/DESIGN.md 5.6. */
export function withinTolerance(
  candidateMm: number,
  requestedMm: number,
  tolerance: number,
): boolean {
  return Math.abs(candidateMm - requestedMm) <= tolerance * requestedMm;
}
