import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
  ThreadSystem,
} from './attributes';

export const ATTRIBUTE_NAMES = [
  'diameter',
  'pitch',
  'length',
  'type',
  'material',
  'finish',
  'standard',
] as const;

export type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

export type Provenance = 'explicit' | 'inferred' | 'corrected' | 'approximate' | 'unrecognized';

export interface Weighted<T> {
  value: T;
  strength: number;
}

export interface Diameter {
  system: ThreadSystem;
  nominal: string;
  mm: number;
  /** False for a parseable but non-catalog nominal, which must reach the null
   * hypothesis rather than be dropped. */
  known: boolean;
}

export type LengthUnit = 'in' | 'mm' | 'ft';

export interface Length {
  value: number;
  unit: LengthUnit;
  mm: number;
}

export interface ParsedSpec {
  diameter?: Diameter;
  pitch?: string;
  length?: Length;
  /** One entry per reading of an ambiguous term: "washer" is flat and lock. */
  type?: Weighted<ProductType>[];
  material?: Weighted<Material | MaterialFamily>;
  finish?: Weighted<Finish | FinishFamily>;
  standard?: string;
  /** Residue never changes which items are compatible; it only lowers confidence. */
  residue: string[];
  evidence: Partial<Record<AttributeName, string>>;
  provenance: Partial<Record<AttributeName, Provenance>>;
}
