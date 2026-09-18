import { describe, expect, it } from 'vitest';

import type { ProductType } from '../domain/attributes';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { PROTECTED_CODES, longestMatch } from './lexicon';

const { familyCredit, termStrengths } = DEFAULT_MATCHER_CONFIG;

const tokens = (phrase: string) => phrase.toLowerCase().split(' ');

const typesOf = (phrase: string) => {
  const match = longestMatch(tokens(phrase)).find((m) => m.attribute === 'type');
  return match?.values.map((v) => v.value) ?? [];
};

const firstOf = (phrase: string, attribute: string) =>
  longestMatch(tokens(phrase)).find((m) => m.attribute === attribute);

// Every distinct type phrase in data/catalog.csv, read off the file.
const CATALOG_PHRASES: ReadonlyArray<readonly [string, ProductType]> = [
  ['BTN SOC CAP SCREW', 'button_socket_cap_screw'],
  ['BTN SOCKET CAP SCR', 'button_socket_cap_screw'],
  ['BTN SOCKET CAP SCREW', 'button_socket_cap_screw'],
  ['BUTTON SOC CAP SCR', 'button_socket_cap_screw'],
  ['BUTTON SOC CAP SCREW', 'button_socket_cap_screw'],
  ['BUTTON SOCKET CAP SCR', 'button_socket_cap_screw'],
  ['BUTTON SOCKET CAP SCREW', 'button_socket_cap_screw'],
  ['FLAT WASHER', 'flat_washer'],
  ['FLAT WSHR', 'flat_washer'],
  ['FULL THREAD ROD', 'threaded_rod'],
  ['HEX CAP SCR', 'hex_cap_screw'],
  ['HEX CAP SCREW', 'hex_cap_screw'],
  ['HEX NUT', 'hex_nut'],
  ['HX CAP SCR', 'hex_cap_screw'],
  ['HX CAP SCREW', 'hex_cap_screw'],
  ['HX HD LAG SCR', 'lag_screw'],
  ['HX NUT', 'hex_nut'],
  ['LAG SCR', 'lag_screw'],
  ['LAG SCREW', 'lag_screw'],
  ['LOCK WASHER', 'lock_washer'],
  ['LOCK WSHR', 'lock_washer'],
  ['PHIL PAN MACH SCR', 'pan_machine_screw'],
  ['PHIL PAN MACH SCREW', 'pan_machine_screw'],
  ['PHIL PAN MACHINE SCR', 'pan_machine_screw'],
  ['PHIL PAN MACHINE SCREW', 'pan_machine_screw'],
  ['PHILLIPS PAN MACH SCR', 'pan_machine_screw'],
  ['PHILLIPS PAN MACH SCREW', 'pan_machine_screw'],
  ['PHILLIPS PAN MACHINE SCR', 'pan_machine_screw'],
  ['PHILLIPS PAN MACHINE SCREW', 'pan_machine_screw'],
  ['SOC HEAD CAP SCR', 'socket_head_cap_screw'],
  ['SOC HEAD CAP SCREW', 'socket_head_cap_screw'],
  ['SOCKET HEAD CAP SCR', 'socket_head_cap_screw'],
  ['SOCKET HEAD CAP SCREW', 'socket_head_cap_screw'],
  ['TAP BOLT', 'tap_bolt'],
  ['THREADED ROD', 'threaded_rod'],
];

describe('catalog type phrases', () => {
  it('covers all 35 distinct phrases in the catalog', () => {
    expect(CATALOG_PHRASES).toHaveLength(35);
  });

  it.each(CATALOG_PHRASES)('resolves %s to %s at full strength', (phrase, expected) => {
    const match = firstOf(phrase, 'type');

    expect(match?.values).toEqual([{ value: expected, strength: 1 }]);
    expect(match?.start).toBe(0);
    expect(match?.end).toBe(tokens(phrase).length);
  });
});

describe('query abbreviations', () => {
  const SINGLE: ReadonlyArray<readonly [string, ProductType]> = [
    ['shcs', 'socket_head_cap_screw'],
    ['socket head', 'socket_head_cap_screw'],
    ['allen head', 'socket_head_cap_screw'],
    ['allen bolt', 'socket_head_cap_screw'],
    ['bhcs', 'button_socket_cap_screw'],
    ['button head', 'button_socket_cap_screw'],
    ['button socket', 'button_socket_cap_screw'],
    ['hhcs', 'hex_cap_screw'],
    ['hex head cap screw', 'hex_cap_screw'],
    ['pan head', 'pan_machine_screw'],
    ['phil pan', 'pan_machine_screw'],
    ['pms', 'pan_machine_screw'],
    ['lag', 'lag_screw'],
    ['lag bolt', 'lag_screw'],
    ['hex lag', 'lag_screw'],
    ['rod', 'threaded_rod'],
    ['all thread', 'threaded_rod'],
    ['allthread', 'threaded_rod'],
    ['atr', 'threaded_rod'],
    ['hn', 'hex_nut'],
    ['nut', 'hex_nut'],
    ['fw', 'flat_washer'],
    ['lw', 'lock_washer'],
    ['split washer', 'lock_washer'],
    ['spring washer', 'lock_washer'],
    ['split lock washer', 'lock_washer'],
  ];

  it.each(SINGLE)('resolves %s to %s', (term, expected) => {
    expect(typesOf(term)).toEqual([expected]);
  });

  it.each(['hhb', 'hex bolt', 'hex head bolt'])(
    'resolves %s to the hex-head family, both at full strength',
    (term) => {
      expect(firstOf(term, 'type')?.values).toEqual([
        { value: 'hex_cap_screw', strength: 1 },
        { value: 'tap_bolt', strength: 1 },
      ]);
    },
  );

  it('resolves washer to both washer types at the generic strength', () => {
    expect(firstOf('washer', 'type')?.values).toEqual([
      { value: 'flat_washer', strength: termStrengths.generic },
      { value: 'lock_washer', strength: termStrengths.generic },
    ]);
  });

  it('resolves bolt to three types, the lag reading the least likely', () => {
    expect(firstOf('bolt', 'type')?.values).toEqual([
      { value: 'hex_cap_screw', strength: termStrengths.ambiguous },
      { value: 'tap_bolt', strength: termStrengths.ambiguous },
      { value: 'lag_screw', strength: termStrengths.distant },
    ]);
  });

  it('resolves machine screw at the generic strength', () => {
    expect(firstOf('machine screw', 'type')?.values).toEqual([
      { value: 'pan_machine_screw', strength: termStrengths.generic },
    ]);
  });

  it('resolves stud at the ambiguous strength', () => {
    expect(firstOf('stud', 'type')?.values).toEqual([
      { value: 'threaded_rod', strength: termStrengths.ambiguous },
    ]);
  });

  it('resolves hex screw as a loose family term', () => {
    expect(firstOf('hex screw', 'type')?.values).toEqual([
      { value: 'hex_cap_screw', strength: familyCredit },
    ]);
  });
});

describe('type phrases the catalog does not carry', () => {
  const UNKNOWN = [
    'carriage bolt',
    'eye bolt',
    'u bolt',
    'j bolt',
    'shoulder bolt',
    'square head bolt',
    'wing nut',
    'acorn nut',
  ];

  it.each(UNKNOWN)('spans the whole of %s', (phrase) => {
    const match = firstOf(phrase, 'unknownType');

    expect(match?.term).toBe(phrase);
    expect(match?.start).toBe(0);
    expect(match?.end).toBe(tokens(phrase).length);
  });

  it.each(UNKNOWN)('lets %s win over the head word inside it', (phrase) => {
    expect(longestMatch(tokens(phrase)).map((m) => m.attribute)).toEqual(['unknownType']);
  });

  it('carries no reading, since the phrase names nothing the catalog stocks', () => {
    expect(firstOf('carriage bolt', 'unknownType')?.values).toEqual([]);
  });

  it.each(['hex bolt', 'lag bolt', 'allen bolt', 'hex nut'])('leaves %s a type', (phrase) => {
    expect(longestMatch(tokens(phrase)).map((m) => m.attribute)).toEqual(['type']);
  });
});

describe('longest match', () => {
  it('prefers the four-token phrase over the two-token one inside it', () => {
    const match = firstOf('socket head cap screw', 'type');

    expect(match?.term).toBe('socket head cap screw');
    expect(match?.end).toBe(4);
  });

  it('prefers flat washer over washer alone', () => {
    expect(typesOf('flat washer')).toEqual(['flat_washer']);
  });

  it('reports the span of each match in the token stream', () => {
    const matches = longestMatch(['m8', 'flat', 'washer', 'steel', 'zinc']);

    expect(matches.map((m) => [m.attribute, m.start, m.end])).toEqual([
      ['type', 1, 3],
      ['material', 3, 4],
      ['finish', 4, 5],
    ]);
  });

  it('leaves unknown tokens uncovered', () => {
    expect(longestMatch(['nylon', 'sparkle'])).toEqual([]);
  });

  it('does not match across a token it cannot cover', () => {
    expect(typesOf('flat nylon washer')).toEqual(['flat_washer', 'lock_washer']);
  });
});

describe('material terms', () => {
  // Every material spelling that occurs in data/catalog.csv.
  const CATALOG: ReadonlyArray<readonly [string, string]> = [
    ['steel', 'steel'],
    ['18-8 ss', 'ss_18_8'],
    ['316 ss', 'ss_316'],
    ['a2 ss', 'ss_a2'],
    ['brass', 'brass'],
    ['alloy', 'alloy'],
  ];

  const QUERY: ReadonlyArray<readonly [string, string]> = [
    ['18-8', 'ss_18_8'],
    ['304', 'ss_18_8'],
    ['ss 304', 'ss_18_8'],
    ['316', 'ss_316'],
    ['a4', 'ss_316'],
    ['a2', 'ss_a2'],
    ['alloy steel', 'alloy'],
  ];

  it.each([...CATALOG, ...QUERY])('resolves %s to %s exactly', (term, expected) => {
    expect(firstOf(term, 'material')?.values).toEqual([{ value: expected, strength: 1 }]);
  });

  it.each(['stainless', 'ss', 'inox'])('resolves %s to the family at partial credit', (term) => {
    expect(firstOf(term, 'material')?.values).toEqual([
      { value: 'stainless', strength: familyCredit },
    ]);
  });

  it('keeps a2 apart from 18-8 rather than treating them as the same material', () => {
    expect(firstOf('a2', 'material')?.values).toEqual([{ value: 'ss_a2', strength: 1 }]);
    expect(firstOf('18-8', 'material')?.values).toEqual([{ value: 'ss_18_8', strength: 1 }]);
  });
});

describe('finish terms', () => {
  // Every finish spelling that occurs in data/catalog.csv, the fourth yellow form included.
  const CATALOG: ReadonlyArray<readonly [string, string]> = [
    ['zinc', 'zinc'],
    ['zn', 'zinc'],
    ['yellow zinc', 'yellow_zinc'],
    ['yel zinc', 'yellow_zinc'],
    ['yellow zn', 'yellow_zinc'],
    ['yel zn', 'yellow_zinc'],
    ['mech zinc', 'mech_zinc'],
    ['mech zn', 'mech_zinc'],
    ['hdg', 'hdg'],
    ['plain', 'plain'],
    ['pln', 'plain'],
    ['black oxide', 'black_oxide'],
  ];

  const QUERY: ReadonlyArray<readonly [string, string]> = [
    ['zinc plated', 'zinc'],
    ['zp', 'zinc'],
    ['yz', 'yellow_zinc'],
    ['mechanical zinc', 'mech_zinc'],
    ['hot dip', 'hdg'],
    ['hot dipped', 'hdg'],
    ['galvanized', 'hdg'],
    ['galv', 'hdg'],
    ['bare', 'plain'],
    ['uncoated', 'plain'],
    ['blk oxide', 'black_oxide'],
  ];

  it.each([...CATALOG, ...QUERY])('resolves %s to %s exactly', (term, expected) => {
    expect(firstOf(term, 'finish')?.values).toEqual([{ value: expected, strength: 1 }]);
  });

  it('covers all twelve finish spellings the catalog uses', () => {
    expect(CATALOG).toHaveLength(12);
  });

  it('resolves yellow alone as a short form, since only one finish is yellow', () => {
    expect(firstOf('yellow', 'finish')?.values).toEqual([
      { value: 'yellow_zinc', strength: termStrengths.shortForm },
    ]);
  });

  it('resolves black alone weakly', () => {
    expect(firstOf('black', 'finish')?.values).toEqual([
      { value: 'black_oxide', strength: termStrengths.weak },
    ]);
  });
});

describe('standard terms', () => {
  const STANDARDS: ReadonlyArray<readonly [string, string]> = [
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

  it.each(STANDARDS)('resolves %s to %s', (term, expected) => {
    expect(firstOf(term, 'standard')?.values).toEqual([{ value: expected, strength: 1 }]);
  });

  it('reaches all seven catalog standards', () => {
    expect(new Set(STANDARDS.map(([, canonical]) => canonical)).size).toBe(7);
  });

  it('never lets a standard imply a product type', () => {
    expect(longestMatch(tokens('din 912')).map((m) => m.attribute)).toEqual(['standard']);
    expect(longestMatch(tokens('iso 7380')).map((m) => m.attribute)).toEqual(['standard']);
  });
});

describe('protected codes', () => {
  it('protects the short codes the fuzzy matcher must not rewrite', () => {
    expect([...PROTECTED_CODES].sort()).toEqual([
      'asme',
      'astm',
      'btn',
      'din',
      'hdg',
      'hex',
      'ifi',
      'iso',
      'lag',
      'nut',
      'pln',
      'scr',
      'soc',
      'ss',
      'yel',
      'zn',
    ]);
  });
});
