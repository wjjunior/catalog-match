import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
  Standard,
} from '../domain/attributes';
import type { Weighted } from '../domain/spec';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';

const { familyCredit, termStrengths } = DEFAULT_MATCHER_CONFIG;

export type LexiconAttribute = 'type' | 'material' | 'finish' | 'standard' | 'unknownType';

export type LexiconValue =
  ProductType | Material | MaterialFamily | Finish | FinishFamily | Standard;

export interface LexiconEntry {
  attribute: LexiconAttribute;
  values: readonly Weighted<LexiconValue>[];
}

export interface LexiconMatch extends LexiconEntry {
  term: string;
  start: number;
  end: number;
}

/** Spellings the catalog uses interchangeably inside a type phrase. */
const WORD_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  hex: ['hex', 'hx'],
  screw: ['screw', 'scr'],
  socket: ['socket', 'soc'],
  button: ['button', 'btn'],
  phillips: ['phillips', 'phil'],
  machine: ['machine', 'mach'],
  washer: ['washer', 'wshr'],
};

function expand(template: string): string[] {
  return template
    .split(' ')
    .reduce<string[]>(
      (phrases, word) =>
        (WORD_VARIANTS[word] ?? [word]).flatMap((variant) =>
          phrases.map((phrase) => (phrase ? `${phrase} ${variant}` : variant)),
        ),
      [''],
    );
}

const full = (...values: ProductType[]): Weighted<LexiconValue>[] =>
  values.map((value) => ({ value, strength: 1 }));

const at = (strength: number, ...values: ProductType[]): Weighted<LexiconValue>[] =>
  values.map((value) => ({ value, strength }));

/** Templates whose expansion covers every type phrase in the catalog. */
const TYPE_TEMPLATES: ReadonlyArray<readonly [string, ProductType]> = [
  ['hex cap screw', 'hex_cap_screw'],
  ['hex nut', 'hex_nut'],
  ['socket head cap screw', 'socket_head_cap_screw'],
  ['button socket cap screw', 'button_socket_cap_screw'],
  ['phillips pan machine screw', 'pan_machine_screw'],
  ['lag screw', 'lag_screw'],
  ['hex hd lag screw', 'lag_screw'],
  ['flat washer', 'flat_washer'],
  ['lock washer', 'lock_washer'],
  ['tap bolt', 'tap_bolt'],
  ['threaded rod', 'threaded_rod'],
  ['full thread rod', 'threaded_rod'],
];

const TYPE_TERMS: ReadonlyArray<readonly [string, Weighted<LexiconValue>[]]> = [
  ...TYPE_TEMPLATES.flatMap(([template, type]) =>
    expand(template).map((phrase) => [phrase, full(type)] as const),
  ),

  ['shcs', full('socket_head_cap_screw')],
  ['socket head', full('socket_head_cap_screw')],
  ['soc head', full('socket_head_cap_screw')],
  ['socket cap screw', full('socket_head_cap_screw')],
  ['allen head', full('socket_head_cap_screw')],
  ['allen bolt', full('socket_head_cap_screw')],

  ['bhcs', full('button_socket_cap_screw')],
  ['button head', full('button_socket_cap_screw')],
  ['button socket', full('button_socket_cap_screw')],
  ['button cap screw', full('button_socket_cap_screw')],
  ['btn', full('button_socket_cap_screw')],

  ['hhcs', full('hex_cap_screw')],
  ['hex head cap screw', full('hex_cap_screw')],

  ['pan head machine screw', full('pan_machine_screw')],
  ['pan head', full('pan_machine_screw')],
  ['phil pan', full('pan_machine_screw')],
  ['pms', full('pan_machine_screw')],

  ['lag', full('lag_screw')],
  ['lag bolt', full('lag_screw')],
  ['hex lag', full('lag_screw')],

  ['tap screw', full('tap_bolt')],
  ['full thread hex bolt', full('tap_bolt')],

  ['rod', full('threaded_rod')],
  ['all thread', full('threaded_rod')],
  ['allthread', full('threaded_rod')],
  ['atr', full('threaded_rod')],

  ['nut', full('hex_nut')],
  ['finished hex nut', full('hex_nut')],
  ['hn', full('hex_nut')],

  ['fw', full('flat_washer')],
  ['lw', full('lock_washer')],
  ['split washer', full('lock_washer')],
  ['spring washer', full('lock_washer')],
  ['split lock washer', full('lock_washer')],

  // A tap bolt is a fully threaded hex bolt, so a hex-head term names both at full
  // strength and the explanation says which one was matched.
  ['hhb', full('hex_cap_screw', 'tap_bolt')],
  ['hex bolt', full('hex_cap_screw', 'tap_bolt')],
  ['hex head bolt', full('hex_cap_screw', 'tap_bolt')],

  ['hex screw', at(familyCredit, 'hex_cap_screw')],
  ['washer', at(termStrengths.generic, 'flat_washer', 'lock_washer')],
  ['machine screw', at(termStrengths.generic, 'pan_machine_screw')],
  [
    'cap screw',
    at(
      termStrengths.ambiguous,
      'hex_cap_screw',
      'socket_head_cap_screw',
      'button_socket_cap_screw',
    ),
  ],
  ['stud', at(termStrengths.ambiguous, 'threaded_rod')],
  [
    'bolt',
    [
      { value: 'hex_cap_screw', strength: termStrengths.ambiguous },
      { value: 'tap_bolt', strength: termStrengths.ambiguous },
      { value: 'lag_screw', strength: termStrengths.distant },
    ],
  ],
];

/** Fastener types the catalog does not stock, each built on a head word the lexicon reads
 * alone: without an entry only the modifier reaches the residue, which cannot empty C. */
const UNKNOWN_TYPE_TERMS: readonly string[] = [
  'carriage bolt',
  'eye bolt',
  'u bolt',
  'j bolt',
  'shoulder bolt',
  'square head bolt',
  'wing nut',
  'acorn nut',
  // The catalog stocks lock washers and hex nuts, never a lock nut; without this the
  // modifier alone reaches the residue and `nut` answers with hex nuts.
  'lock nut',
];

const MATERIAL_TERMS: ReadonlyArray<readonly [string, Material | MaterialFamily, number]> = [
  ['steel', 'steel', 1],
  ['18-8 ss', 'ss_18_8', 1],
  ['18-8', 'ss_18_8', 1],
  ['304', 'ss_18_8', 1],
  ['ss 304', 'ss_18_8', 1],
  ['316 ss', 'ss_316', 1],
  ['316', 'ss_316', 1],
  ['a4', 'ss_316', 1],
  ['a2 ss', 'ss_a2', 1],
  ['a2', 'ss_a2', 1],
  ['brass', 'brass', 1],
  ['alloy steel', 'alloy', 1],
  ['alloy', 'alloy', 1],
  ['stainless', 'stainless', familyCredit],
  ['ss', 'stainless', familyCredit],
  ['inox', 'stainless', familyCredit],
];

const FINISH_TERMS: ReadonlyArray<readonly [string, Finish | FinishFamily, number]> = [
  ['zinc', 'zinc', 1],
  ['zn', 'zinc', 1],
  ['zinc plated', 'zinc', 1],
  ['zp', 'zinc', 1],
  ['yellow zinc', 'yellow_zinc', 1],
  ['yel zinc', 'yellow_zinc', 1],
  ['yellow zn', 'yellow_zinc', 1],
  // The catalog writes it this way on eight rows; the brief lists only the first three.
  ['yel zn', 'yellow_zinc', 1],
  ['yz', 'yellow_zinc', 1],
  ['yellow', 'yellow_zinc', termStrengths.shortForm],
  ['mech zinc', 'mech_zinc', 1],
  ['mech zn', 'mech_zinc', 1],
  ['mechanical zinc', 'mech_zinc', 1],
  ['hdg', 'hdg', 1],
  ['hot dip', 'hdg', 1],
  ['hot dipped', 'hdg', 1],
  ['galvanized', 'hdg', 1],
  ['galv', 'hdg', 1],
  ['plain', 'plain', 1],
  ['pln', 'plain', 1],
  ['bare', 'plain', 1],
  ['uncoated', 'plain', 1],
  ['black oxide', 'black_oxide', 1],
  ['blk oxide', 'black_oxide', 1],
  ['black', 'black_oxide', termStrengths.weak],
];

const STANDARD_TERMS: ReadonlyArray<readonly [string, Standard]> = [
  ['asme b18.2.1', 'ASME B18.2.1'],
  ['b18.2.1', 'ASME B18.2.1'],
  ['din 912', 'DIN 912'],
  ['din912', 'DIN 912'],
  ['din 933', 'DIN 933'],
  ['din933', 'DIN 933'],
  ['iso 7380', 'ISO 7380'],
  ['iso7380', 'ISO 7380'],
  ['ifi 111', 'IFI 111'],
  ['ifi111', 'IFI 111'],
  ['astm a307', 'ASTM A307'],
  ['a307', 'ASTM A307'],
  ['class 8', 'CLASS 8'],
];

/** The bodies queryParser reads a designator after, so that a standard this catalog does
 * not stock is still parsed as one. docs/DESIGN.md 5.3. */
export const STANDARD_BODIES: ReadonlySet<string> = new Set([
  'din',
  'iso',
  'asme',
  'astm',
  'ansi',
  'ifi',
]);

export const LEXICON: ReadonlyMap<string, LexiconEntry> = new Map<string, LexiconEntry>([
  ...TYPE_TERMS.map(([term, values]) => [term, { attribute: 'type', values }] as const),
  ...UNKNOWN_TYPE_TERMS.map((term) => [term, { attribute: 'unknownType', values: [] }] as const),
  ...MATERIAL_TERMS.map(
    ([term, value, strength]) =>
      [term, { attribute: 'material', values: [{ value, strength }] }] as const,
  ),
  ...FINISH_TERMS.map(
    ([term, value, strength]) =>
      [term, { attribute: 'finish', values: [{ value, strength }] }] as const,
  ),
  ...STANDARD_TERMS.map(
    ([term, value]) => [term, { attribute: 'standard', values: [{ value, strength: 1 }] }] as const,
  ),
]);

/** Short codes the fuzzy matcher must never "correct" into a longer lexicon word. */
export const PROTECTED_CODES: ReadonlySet<string> = new Set([
  'ss',
  'zn',
  'hdg',
  'din',
  'iso',
  'nut',
  'hex',
  'lag',
  'ifi',
  'astm',
  'asme',
  'pln',
  'yel',
  'btn',
  'soc',
  'scr',
]);

const MAX_PHRASE_TOKENS = Math.max(...[...LEXICON.keys()].map((term) => term.split(' ').length));

export function longestMatch(tokens: readonly string[]): LexiconMatch[] {
  const matches: LexiconMatch[] = [];

  for (let i = 0; i < tokens.length;) {
    let width = 0;

    for (let n = Math.min(MAX_PHRASE_TOKENS, tokens.length - i); n >= 1; n--) {
      const term = tokens.slice(i, i + n).join(' ');
      const entry = LEXICON.get(term);
      if (entry) {
        matches.push({ ...entry, term, start: i, end: i + n });
        width = n;
        break;
      }
    }

    i += width || 1;
  }

  return matches;
}
