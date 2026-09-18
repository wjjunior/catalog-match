import { describe, expect, it } from 'vitest';

import { normalize } from './normalize';

describe('tokenizing', () => {
  it('lowercases and collapses irregular whitespace', () => {
    expect(normalize('  HEX   CAP\tSCREW ').canonical).toBe('hex cap screw');
  });

  it('points every token back at the slice of the input it came from', () => {
    const { tokens } = normalize('  HEX   CAP SCREW');

    expect(tokens.map((token) => token.text)).toEqual(['hex', 'cap', 'screw']);
    expect(tokens.map((token) => [token.start, token.end])).toEqual([
      [2, 5],
      [8, 11],
      [12, 17],
    ]);
  });

  it('returns nothing for blank input', () => {
    expect(normalize('   ')).toEqual({ canonical: '', tokens: [], notes: [] });
  });
});

describe('trailing punctuation', () => {
  it('drops the comma a user glues to a word', () => {
    expect(normalize('M8 hex nut, zinc').canonical).toBe('m8 hex nut zinc');
  });

  it('narrows the span to the word and leaves it pointing into the input', () => {
    const { tokens } = normalize('hex nut, zinc');

    expect(tokens.map((token) => [token.text, token.start, token.end])).toEqual([
      ['hex', 0, 3],
      ['nut', 4, 7],
      ['zinc', 9, 13],
    ]);
  });

  it.each([
    ['2",', '2"'],
    ['1/2"', '1/2"'],
    ["6',", "6'"],
    ['b18.2.1,', 'b18.2.1'],
    ['m6-1.0,', 'm6-1.0'],
    ['2.5.', '2.5'],
    ['rod.', 'rod'],
    ['reorder?!', 'reorder'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('drops a token that is nothing but punctuation', () => {
    expect(normalize('m8 , zinc').canonical).toBe('m8 zinc');
  });

  // The strip runs before the separator split, so a comma cannot hide the x that glues
  // a length to its diameter.
  it('frees the separator the comma was glued to', () => {
    expect(normalize('1/2-13x3", zinc').canonical).toBe('1/2-13 x 3" zinc');
  });

  it('still reads a number word that ends in a period', () => {
    expect(normalize('washer no. 10').canonical).toBe('washer #10');
  });
});

describe('quote unification', () => {
  it.each([
    ['3"', '3"'],
    ["3''", '3"'],
    ['3″', '3"'],
    ['3”', '3"'],
    ['3’’', '3"'],
  ])('rewrites %s to the inch mark', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

describe('unicode fractions', () => {
  it.each([
    ['½"', '1/2"'],
    ['¼"', '1/4"'],
    ['¾"', '3/4"'],
    ['⅜"', '3/8"'],
    ['⅝"', '5/8"'],
  ])('rewrites %s to ASCII', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('joins a whole number and a fraction into the catalog mixed-number form', () => {
    expect(normalize('2½"').canonical).toBe('2-1/2"');
  });
});

describe('size separator', () => {
  it.each([
    ['1/2-13 X 3"', '1/2-13 x 3"'],
    ['1/2-13X 3"', '1/2-13 x 3"'],
    ['1/2-13X3"', '1/2-13 x 3"'],
    ['1/2-13x3"', '1/2-13 x 3"'],
    ['M6-1.0×50MM', 'm6-1.0 x 50mm'],
    ['#10-24x1/2"', '#10-24 x 1/2"'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('never splits a word that merely contains an x', () => {
    expect(normalize('HEX CAP SCREW HX HD LAG SCR').canonical).toBe('hex cap screw hx hd lag scr');
  });

  it('keeps spans pointing into the glued original when it splits a token', () => {
    const { tokens } = normalize('1/2-13x3"');

    expect(tokens.map((token) => [token.text, token.start, token.end])).toEqual([
      ['1/2-13', 0, 6],
      ['x', 6, 7],
      ['3"', 7, 9],
    ]);
  });

  // The split token must not start at offset 0, or an implementation that numbers the
  // parts from the token instead of the input passes anyway.
  it('offsets a split token against the input, not against the token', () => {
    const { tokens } = normalize('HEX 1/2-13x3"');

    expect(tokens.map((token) => [token.text, token.start, token.end])).toEqual([
      ['hex', 0, 3],
      ['1/2-13', 4, 10],
      ['x', 10, 11],
      ['3"', 11, 13],
    ]);
  });
});

describe('unit aliases', () => {
  it.each([
    ['1/2 INCH', '1/2 in'],
    ['1/2 inches', '1/2 in'],
    ['1/2 in.', '1/2 in'],
    ['1/2 in', '1/2 in'],
    ['6 FOOT', '6 ft'],
    ['6 feet', '6 ft'],
    ['6 ft', '6 ft'],
    ['50 MILLIMETER', '50 mm'],
    ['50 millimetres', '50 mm'],
    ['50 mm', '50 mm'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it.each([
    ['50MM', '50mm'],
    ['6FT', '6ft'],
    ['1INCH', '1in'],
  ])('canonicalizes the unit glued to %s without pulling it apart', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('leaves words that merely contain a unit alias alone', () => {
    expect(normalize('ZINC 18-8 SS MECH ZN PLAIN').canonical).toBe('zinc 18-8 ss mech zn plain');
  });
});

describe('numbered sizes', () => {
  it.each([
    ['#8-32', '#8-32'],
    ['no. 10-24', '#10-24'],
    ['no 10-24', '#10-24'],
    ['number 8', '#8'],
    ['NO. 8-32 HEX NUT', '#8-32 hex nut'],
  ])('canonicalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('spans the merged pair back to both source tokens', () => {
    const { tokens } = normalize('no. 10-24');

    expect(tokens).toEqual([{ text: '#10-24', start: 0, end: 9 }]);
  });

  it('leaves the word alone when no digit follows', () => {
    expect(normalize('no thread').canonical).toBe('no thread');
  });
});

describe('singularizing type nouns', () => {
  it.each([
    ['NUTS', 'nut'],
    ['washers', 'washer'],
    ['screws', 'screw'],
    ['bolts', 'bolt'],
    ['rods', 'rod'],
    ['studs', 'stud'],
  ])('singularizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('is a closed list, not a trailing-s stripper', () => {
    expect(normalize('18-8 SS STAINLESS BRASS').canonical).toBe('18-8 ss stainless brass');
  });
});

describe('stripping quantities and noise', () => {
  it.each([
    ['200 pcs M8', 'm8'],
    ['200 PC M8', 'm8'],
    ['200 pieces M8', 'm8'],
    ['qty 200 M8', 'm8'],
    ['100 EA M8', 'm8'],
    ['M8 hex nut each', 'm8 hex nut'],
  ])('strips the quantity phrase in %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it.each([
    ['please M8', 'm8'],
    ['quote M8', 'm8'],
    ['I need M8', 'i m8'],
    ['I want M8', 'i m8'],
  ])('strips the noise word in %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('keeps a number that is not bound to a quantity word', () => {
    expect(normalize('M8 x 50 BHCS').canonical).toBe('m8 x 50 bhcs');
  });

  it('drops `of` when it sits next to a stripped token', () => {
    expect(normalize('200 pcs of M8').canonical).toBe('m8');
  });

  it('keeps `of` when nothing next to it was stripped', () => {
    expect(normalize('box of M8').canonical).toBe('box of m8');
  });

  it('reports what it removed', () => {
    expect(normalize('please quote 200 pcs of M8').notes).toEqual([
      'quantityStripped',
      'noiseStripped',
    ]);
  });

  it('reports nothing when it removes nothing', () => {
    expect(normalize('M8 hex nut').notes).toEqual([]);
  });

  it('reports each note once', () => {
    expect(normalize('please please 200 pcs 300 pcs M8').notes).toEqual([
      'quantityStripped',
      'noiseStripped',
    ]);
  });
});

describe('the acceptance examples of PRG-12', () => {
  it.each([
    ['1/2-13x3"', '1/2-13 x 3"'],
    ['M6-1.0x50MM', 'm6-1.0 x 50mm'],
    ['please quote 200 pcs of M8 x 50 BHCS black oxide', 'm8 x 50 bhcs black oxide'],
  ])('normalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

// Rows copied from data/catalog.csv, one per form the profiling in docs/DESIGN.md 3.1
// names: each separator shape, each length shape, the row missing its inch mark, and a
// lowercase row.
const CATALOG_FORMS: ReadonlyArray<readonly [string, string]> = [
  ['1/2-13 X 6FT FULL THREAD ROD STEEL ZINC', '1/2-13 x 6ft full thread rod steel zinc'],
  [
    'M4-0.7 X 60MM HEX CAP SCR DIN 912 STEEL YEL ZINC',
    'm4-0.7 x 60mm hex cap scr din 912 steel yel zinc',
  ],
  [
    '5/8-11x2-1/2" BTN SOC CAP SCREW DIN 933 A2 SS YEL ZINC',
    '5/8-11 x 2-1/2" btn soc cap screw din 933 a2 ss yel zinc',
  ],
  ['#8-32 FLAT WSHR ASME B18.2.1 BRASS PLAIN', '#8-32 flat wshr asme b18.2.1 brass plain'],
  ['3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG', '3/8-16 x 1-1/2 hx hd lag scr steel hdg'],
  [
    '3/4-10x3/8" HX CAP SCREW ASTM A307 A2 SS MECH ZN',
    '3/4-10 x 3/8" hx cap screw astm a307 a2 ss mech zn',
  ],
  ['1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC', '1/4-20 x 3/4" hex cap screw steel zinc'],
  ['m12-1.75 x 12mm lag screw brass yellow zn', 'm12-1.75 x 12mm lag screw brass yellow zn'],
  ['5/16 FLAT WASHER STEEL PLAIN', '5/16 flat washer steel plain'],
  ['M16-2.0 HEX NUT IFI 111 18-8 SS PLAIN', 'm16-2.0 hex nut ifi 111 18-8 ss plain'],
];

// The query forms docs/BRIEF.md 2 lists as must-parse.
const QUERY_FORMS: ReadonlyArray<readonly [string, string]> = [
  ['SHCS', 'shcs'],
  ['BHCS', 'bhcs'],
  ['HHB', 'hhb'],
  ['hex bolt', 'hex bolt'],
  ['button socket', 'button socket'],
  ['rod', 'rod'],
  ['pan head', 'pan head'],
  ['1/2 inch', '1/2 in'],
  ['6 foot', '6 ft'],
  ['M4 hex nuts', 'm4 hex nut'],
  ['tap bolt 5/8', 'tap bolt 5/8'],
  ['machine screw 1-1/4', 'machine screw 1-1/4'],
  ['#8-32', '#8-32'],
  ['#10-24', '#10-24'],
  ['brass hex nut 1/2-13', 'brass hex nut 1/2-13'],
  ['lock washer 5/8', 'lock washer 5/8'],
  ['M8 flat washer', 'm8 flat washer'],
  ['the same washers as last time', 'the same washer as last time'],
];

describe('catalog forms', () => {
  it.each(CATALOG_FORMS)('normalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

describe('query forms', () => {
  it.each(QUERY_FORMS)('normalizes %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

const CORPUS: readonly string[] = [
  ...CATALOG_FORMS.map(([input]) => input),
  ...QUERY_FORMS.map(([input]) => input),
  '1/2-13x3"',
  'M6-1.0x50MM',
  'please quote 200 pcs of M8 x 50 BHCS black oxide',
  '2½"',
  "3''",
  'no. 10-24 HEX NUT',
  'M8 hex nut, zinc',
  '1/2" rod.',
  '  HEX   CAP\tSCREW ',
  'qty 200 M8',
  'box of M8',
  '',
];

describe('invariants', () => {
  it.each(CORPUS)('joins the tokens of %s back into the canonical string', (input) => {
    const { canonical, tokens } = normalize(input);

    expect(tokens.map((token) => token.text).join(' ')).toBe(canonical);
  });

  it.each(CORPUS)('quotes the original input at every token span of %s', (input) => {
    let previousEnd = 0;

    for (const token of normalize(input).tokens) {
      expect(token.start).toBeGreaterThanOrEqual(previousEnd);
      expect(token.end).toBeGreaterThan(token.start);
      expect(token.end).toBeLessThanOrEqual(input.length);
      expect(input.slice(token.start, token.end).trim()).not.toBe('');
      previousEnd = token.end;
    }
  });

  // Spans and notes cannot survive a second pass: spans would point into the canonical
  // string, and a stripped quantity is already gone. Idempotence holds on the text.
  it.each(CORPUS)('is idempotent on the canonical form of %s', (input) => {
    const once = normalize(input);
    const twice = normalize(once.canonical);

    expect(twice.canonical).toBe(once.canonical);
    expect(twice.tokens.map((token) => token.text)).toEqual(once.tokens.map((token) => token.text));
  });
});
