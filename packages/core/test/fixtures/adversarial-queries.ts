import { DEFAULT_MATCHER_CONFIG } from '../../src/matching/config';
import {
  at,
  HALF,
  inches,
  M12,
  M8,
  millimetres,
  THREE_QUARTERS,
  type QueryFixture,
} from './example-queries';

const { fuzzyStrength } = DEFAULT_MATCHER_CONFIG;

/** The behaviours the example set does not provoke: inference, correction, mismatch,
 * residue and the noise a real request arrives wrapped in. */
export const ADVERSARIAL_QUERIES: readonly QueryFixture[] = [
  {
    // The nominal is not written anywhere, so the diameter is inferred, not explicit.
    query: '12 millimeter hex nut',
    spec: { ...M12, type: at(1, 'hex_nut'), residue: [] },
  },
  {
    // A metric diameter with an inch length: the length is kept as stated so the
    // mismatch survives to the note and to the approximate search.
    query: 'M8 x 3/4 hex cap screw',
    spec: { ...M8, length: inches(0.75, 19.05), type: at(1, 'hex_cap_screw'), residue: [] },
  },
  {
    query: 'hex nutt',
    spec: { type: at(fuzzyStrength, 'hex_nut'), residue: [] },
  },
  {
    query: 'socket haed cap screw',
    spec: { type: at(fuzzyStrength, 'socket_head_cap_screw'), residue: [] },
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
    query: 'M8 hex nut nylon insert',
    spec: { ...M8, type: at(1, 'hex_nut'), residue: ['nylon', 'insert'] },
  },
  {
    // docs/DESIGN.md 6: grade 8 is not CLASS 8 and its number is not a length.
    query: 'grade 8 1/2-13 hex nut',
    spec: { ...HALF, type: at(1, 'hex_nut'), residue: ['grade', '8'] },
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
    query: 'please quote 200 pcs of M8 x 50 BHCS black oxide',
    spec: {
      ...M8,
      length: millimetres(50),
      type: at(1, 'button_socket_cap_screw'),
      finish: { value: 'black_oxide', strength: 1 },
      residue: [],
    },
  },
];
