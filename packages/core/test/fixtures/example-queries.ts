import type { Diameter, Length, ParsedSpec, Weighted } from '../../src/domain/spec';
import type { ProductType } from '../../src/domain/attributes';
import { DEFAULT_MATCHER_CONFIG } from '../../src/matching/config';

/** Evidence and provenance are asserted case by case; the Omit makes a value field added
 * to ParsedSpec break every fixture instead of going untested. */
export type SpecValues = Omit<ParsedSpec, 'evidence' | 'provenance'>;

export interface QueryFixture {
  query: string;
  spec: SpecValues;
  intentCandidates?: string[];
}

/** A nominal and the pitch the catalog gives it: stated in the query or inferred from
 * the diameter table, the value is the same one in every example below. */
export interface Thread {
  diameter: Diameter;
  pitch: string;
}

const metric = (nominal: string, mm: number, pitch: string): Thread => ({
  diameter: { system: 'metric', nominal, mm, known: true },
  pitch,
});

const imperial = (nominal: string, mm: number, pitch: string): Thread => ({
  diameter: { system: 'imperial', nominal, mm, known: true },
  pitch,
});

const numbered = (nominal: string, mm: number, pitch: string): Thread => ({
  diameter: { system: 'number', nominal, mm, known: true },
  pitch,
});

const M4 = metric('M4', 4, '0.7');
const M5 = metric('M5', 5, '0.8');
const M6 = metric('M6', 6, '1.0');
export const M8 = metric('M8', 8, '1.25');
const M10 = metric('M10', 10, '1.5');
export const M12 = metric('M12', 12, '1.75');
const M16 = metric('M16', 16, '2.0');
const QUARTER = imperial('1/4', 6.35, '20');
const FIVE_SIXTEENTHS = imperial('5/16', 7.9375, '18');
const THREE_EIGHTHS = imperial('3/8', 9.525, '16');
const SEVEN_SIXTEENTHS = imperial('7/16', 11.1125, '14');
export const HALF = imperial('1/2', 12.7, '13');
const FIVE_EIGHTHS = imperial('5/8', 15.875, '11');
export const THREE_QUARTERS = imperial('3/4', 19.05, '10');
const NUMBER_8 = numbered('#8', 4.1656, '32');
const NUMBER_10 = numbered('#10', 4.826, '24');

export const inches = (value: number, mm: number): Length => ({ value, unit: 'in', mm });
export const millimetres = (value: number): Length => ({ value, unit: 'mm', mm: value });
const feet = (value: number, mm: number): Length => ({ value, unit: 'ft', mm });

export const at = (strength: number, ...values: ProductType[]): Weighted<ProductType>[] =>
  values.map((value) => ({ value, strength }));

const { generic } = DEFAULT_MATCHER_CONFIG.termStrengths;

/**
 * The 33 queries of "Example test queries (no right answers - meant to provoke different
 * behaviors)", in document order. Its numbering runs 1 to 32 and then jumps to 34.
 */
export const EXAMPLE_QUERIES: readonly QueryFixture[] = [
  {
    query: 'M8 flat washer',
    spec: { ...M8, type: at(1, 'flat_washer'), residue: [] },
  },
  {
    query: '5/16 hex nut',
    spec: { ...FIVE_SIXTEENTHS, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    query: '1/2 inch hex nut',
    spec: { ...HALF, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    query: 'M6 hex nuts',
    spec: { ...M6, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    query: 'SHCS 7/16 x 2-1/2',
    spec: {
      ...SEVEN_SIXTEENTHS,
      length: inches(2.5, 63.5),
      type: at(1, 'socket_head_cap_screw'),
      residue: [],
    },
  },
  {
    query: '1/2 rod 6 foot',
    spec: { ...HALF, length: feet(6, 1828.8), type: at(1, 'threaded_rod'), residue: [] },
  },
  {
    query: 'HHB 3/4-10 x 5/8',
    spec: {
      ...THREE_QUARTERS,
      length: inches(0.625, 15.875),
      type: at(1, 'hex_cap_screw', 'tap_bolt'),
      residue: [],
    },
  },
  {
    query: 'lock washer 5/8',
    spec: { ...FIVE_EIGHTHS, type: at(1, 'lock_washer'), residue: [] },
  },
  {
    query: 'M8 x 16 hex cap screw',
    spec: { ...M8, length: millimetres(16), type: at(1, 'hex_cap_screw'), residue: [] },
  },
  {
    query: 'M16 threaded rod 60mm',
    spec: { ...M16, length: millimetres(60), type: at(1, 'threaded_rod'), residue: [] },
  },
  {
    query: '5/8 flat washer',
    spec: { ...FIVE_EIGHTHS, type: at(1, 'flat_washer'), residue: [] },
  },
  {
    query: 'M12 x 50mm button socket',
    spec: {
      ...M12,
      length: millimetres(50),
      type: at(1, 'button_socket_cap_screw'),
      residue: [],
    },
  },
  {
    query: '#8-32 lock washer',
    spec: { ...NUMBER_8, type: at(1, 'lock_washer'), residue: [] },
  },
  {
    query: '1/4-20 x 3/4 hex cap screw zinc',
    spec: {
      ...QUARTER,
      length: inches(0.75, 19.05),
      type: at(1, 'hex_cap_screw'),
      finish: { value: 'zinc', strength: 1 },
      residue: [],
    },
  },
  {
    query: 'M4 x 16mm socket head cap screw',
    spec: {
      ...M4,
      length: millimetres(16),
      type: at(1, 'socket_head_cap_screw'),
      residue: [],
    },
  },
  {
    query: '3/8 lag screw 1 inch',
    spec: { ...THREE_EIGHTHS, length: inches(1, 25.4), type: at(1, 'lag_screw'), residue: [] },
  },
  {
    query: 'M5 x 30 threaded rod',
    spec: { ...M5, length: millimetres(30), type: at(1, 'threaded_rod'), residue: [] },
  },
  {
    query: '7/16-14 phillips pan machine screw 1-1/4',
    spec: {
      ...SEVEN_SIXTEENTHS,
      length: inches(1.25, 31.75),
      type: at(1, 'pan_machine_screw'),
      residue: [],
    },
  },
  {
    query: '5/16-18 flat washer',
    spec: { ...FIVE_SIXTEENTHS, type: at(1, 'flat_washer'), residue: [] },
  },
  {
    query: 'M10 x 60mm lag screw',
    spec: { ...M10, length: millimetres(60), type: at(1, 'lag_screw'), residue: [] },
  },
  {
    query: 'M8 x 50mm BHCS',
    spec: {
      ...M8,
      length: millimetres(50),
      type: at(1, 'button_socket_cap_screw'),
      residue: [],
    },
  },
  {
    query: '3/4-10 tap bolt 5/8',
    spec: {
      ...THREE_QUARTERS,
      length: inches(0.625, 15.875),
      type: at(1, 'tap_bolt'),
      residue: [],
    },
  },
  {
    query: 'M12 hex nut',
    spec: { ...M12, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    query: '1/2-13 x 3 lag screw',
    spec: { ...HALF, length: inches(3, 76.2), type: at(1, 'lag_screw'), residue: [] },
  },
  {
    query: 'M6 x 50mm tap bolt',
    spec: { ...M6, length: millimetres(50), type: at(1, 'tap_bolt'), residue: [] },
  },
  {
    query: '#10-24 x 1/2 threaded rod',
    spec: {
      ...NUMBER_10,
      length: inches(0.5, 12.7),
      type: at(1, 'threaded_rod'),
      residue: [],
    },
  },
  {
    query: '5/8-11 x 3/8 lag screw',
    spec: {
      ...FIVE_EIGHTHS,
      length: inches(0.375, 9.525),
      type: at(1, 'lag_screw'),
      residue: [],
    },
  },
  {
    query: 'M16 x 8mm pan head machine screw',
    spec: { ...M16, length: millimetres(8), type: at(1, 'pan_machine_screw'), residue: [] },
  },
  {
    query: '3/8-16 x 4 hex bolt',
    spec: {
      ...THREE_EIGHTHS,
      length: inches(4, 101.6),
      type: at(1, 'hex_cap_screw', 'tap_bolt'),
      residue: [],
    },
  },
  {
    query: 'M4 hex nut',
    spec: { ...M4, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    query: 'M8 x 50mm button socket cap screw alloy black oxide',
    spec: {
      ...M8,
      length: millimetres(50),
      type: at(1, 'button_socket_cap_screw'),
      material: { value: 'alloy', strength: 1 },
      finish: { value: 'black_oxide', strength: 1 },
      residue: [],
    },
  },
  {
    query: 'brass hex nut 1/2-13',
    spec: {
      ...HALF,
      type: at(1, 'hex_nut'),
      material: { value: 'brass', strength: 1 },
      residue: [],
    },
  },
  {
    // The only query of the set with no attribute to match on: it is answered from
    // history, and the words that say so are not residue.
    query: 'the same washers as last time',
    spec: { type: at(generic, 'flat_washer', 'lock_washer'), residue: ['the', 'as'] },
    intentCandidates: ['same', 'last time'],
  },
];
