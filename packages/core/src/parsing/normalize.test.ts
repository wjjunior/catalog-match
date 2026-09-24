import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { STANDARD_BODIES } from './lexicon';
import { normalize } from './normalize';
import { parseQuery } from './queryParser';

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

  it('keeps a number the separator already bound, whichever side the quantity word is on', () => {
    expect(normalize('M8 x 50 qty 100 BHCS').canonical).toBe('m8 x 50 bhcs');
    expect(normalize('M8 x 50 BHCS qty 100').canonical).toBe('m8 x 50 bhcs');
  });

  it('still strips the quantity itself in either word order', () => {
    expect(normalize('M8 x 50 qty 100 BHCS').notes).toEqual(['quantityStripped']);
    expect(normalize('M8 x 50 BHCS qty 100').notes).toEqual(['quantityStripped']);
  });

  it('strips a number a quantity word binds on its own, with no separator in front', () => {
    expect(normalize('100 qty M8 hex nut').canonical).toBe('m8 hex nut');
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

// Round 4 rebuilt `claimedQuantityNumbers` on a single rule: a quantity word takes the
// number beside it — the governed side when both sides are numbers — and gives up a lone
// neighbour only when the token in front of that number already binds it, which is the
// separator `x` or the body of a standard, and `x` only holds against the adverbs. There is
// no tally of the rest of the query and no position rule. The round-3 demand that
// `M8 BHCS 50 each` keep its 50 is withdrawn: protecting a bare number by where it sat is
// what read `qty 100` as a 100-inch length.

interface Dimension {
  token: string;
  /** A bare run of digits is the only shape a quantity word can reach for at all. */
  bare: boolean;
  label: string;
}

const DIMENSIONS: readonly Dimension[] = [
  { token: '50', bare: true, label: 'bare integer' },
  { token: '50mm', bare: false, label: 'unit-attached' },
  { token: '3/4', bare: false, label: 'bare fraction' },
  { token: '1-1/2', bare: false, label: 'mixed number' },
];

// The same product and dimension said the two ways a query says them: bound by the
// separator, or standing loose after the type. No dimension at all is the third way, and
// the one H1 is about.
const baseTokens = (dimension: string | undefined, xBound: boolean): string[] => {
  if (dimension === undefined) return ['m8', 'bhcs'];

  return xBound ? ['m8', 'x', dimension, 'bhcs'] : ['m8', 'bhcs', dimension];
};

interface Standard {
  tokens: readonly string[];
  label: string;
}

const STANDARDS: readonly Standard[] = [
  { tokens: [], label: 'absent' },
  { tokens: ['iso', '7380'], label: 'spaced' },
  { tokens: ['iso7380'], label: 'compact' },
];

interface NumberedPhrase {
  tokens: readonly string[];
  number: string;
  word: string;
  label: string;
}

const NUMBERED_PHRASES: readonly NumberedPhrase[] = [
  { tokens: ['qty', '100'], number: '100', word: 'qty', label: 'qty 100' },
  { tokens: ['5', 'ea'], number: '5', word: 'ea', label: '5 ea' },
];

const BARE_WORDS = ['qty', 'each'] as const;

// The whole of `QUANTITY_WORDS` is `pcs pc pieces piece ea each qty`: two adverbs that say
// how a count is spread, and five nouns that name one. Restated from the word list itself,
// so a word moving between the two halves has to be moved here as well.
const DISTRIBUTIVE_WORDS = new Set(['ea', 'each']);

const QUANTITY_RUNS: readonly (readonly string[])[] = [
  ...NUMBERED_PHRASES.map((phrase) => phrase.tokens),
  ...BARE_WORDS.map((word) => [word]),
];

// Where a person actually puts a quantity: at the end of the request, or right after the
// item is named. Every other index is contrived, and gets the weaker assertion further down
// rather than a demand that a dimension survive it.
const PLACEMENTS = ['trailing', 'afterProduct'] as const;

type Placement = (typeof PLACEMENTS)[number];

function assemble(
  base: readonly string[],
  standard: readonly string[],
  phrase: readonly string[],
  placement: Placement,
): string {
  if (placement === 'trailing') return [...base, ...standard, ...phrase].join(' ');

  const afterType = base.indexOf('bhcs') + 1;

  return [...base.slice(0, afterType), ...phrase, ...base.slice(afterType), ...standard].join(' ');
}

const wordsOf = (query: string): string[] => normalize(query).tokens.map((token) => token.text);

describe('an explicit quantity is removed wherever it sits (H1)', () => {
  it.each([
    ['brass hex nut 1/2-13 qty 100', 'brass hex nut 1/2-13'],
    ['brass hex nut 1/2-13 100 pcs', 'brass hex nut 1/2-13'],
    ['100 pcs brass hex nut 1/2-13', 'brass hex nut 1/2-13'],
    ['M8 hex nut qty 100', 'm8 hex nut'],
    ['M8 flat washer qty 200', 'm8 flat washer'],
    ['M8 x 50 qty 100 BHCS', 'm8 x 50 bhcs'],
    ['M8 x 50 BHCS qty 100', 'm8 x 50 bhcs'],
    ['M8 BHCS 50 qty 100', 'm8 bhcs 50'],
    ['1/4-20 x qty 100 3/4 hex cap screw', '1/4-20 x 3/4 hex cap screw'],
    ['3/4-10 tap bolt qty 100 5/8"', '3/4-10 tap bolt 5/8"'],
    ['200 pcs of m8', 'm8'],
    ['box of m8', 'box of m8'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  // Withdrawn in round 3's favour and reinstated here: the 50 carries neither a separator
  // nor a unit, so it is the quantity `each` says it is.
  it.each([
    ['M8 BHCS 50 each', 'm8 bhcs'],
    ['M8 BHCS each 50', 'm8 bhcs'],
    ['M8 BHCS 50 ea', 'm8 bhcs'],
    ['M8 BHCS 50 pcs', 'm8 bhcs'],
  ])('lets the quantity word have the unbound number in %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it('agrees on the canonical output whether the quantity phrase sits before or after the type', () => {
    expect(normalize('M8 x 50 qty 100 BHCS').canonical).toBe(
      normalize('M8 x 50 BHCS qty 100').canonical,
    );
  });

  it.each([
    ['M8 BHCS 50 qty 100', 'm8 bhcs 50'],
    ['M8 BHCS 100 pcs 50', 'm8 bhcs 50'],
    ['M8 BHCS 50 100 pcs', 'm8 bhcs 50'],
  ])('governs one adjacent number and not both in %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

describe('a dimension the number itself vouches for survives', () => {
  it.each([
    ['M8 BHCS x 50 each', 'm8 bhcs x 50'],
    ['M8 x 50 each BHCS ISO 7380', 'm8 x 50 bhcs iso 7380'],
    ['M8 x 50 each BHCS ISO7380', 'm8 x 50 bhcs iso7380'],
    ['M8 BHCS x 50mm each', 'm8 bhcs x 50mm'],
    ['M8 BHCS 50mm each', 'm8 bhcs 50mm'],
    ['M8 BHCS 3/4 each', 'm8 bhcs 3/4'],
    ['M8 BHCS 1-1/2 each', 'm8 bhcs 1-1/2'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });
});

// The collision that is left once the count nouns are out of it: an adverb reaching for a
// number `x` has bound. `M8 BHCS x 50 each` must keep its 50, and these queries are
// identical to it in every token the rule reads, so they keep theirs too.
describe('the separator wins the number only an adverb reaches for', () => {
  it.each([
    ['M8 x 5 ea 50mm BHCS', 'm8 x 5 50mm bhcs'],
    ['1/4-20 x 5 ea 3/4 hex cap screw', '1/4-20 x 5 3/4 hex cap screw'],
    ['1/4-20 x 100 each 3/4 hex cap screw', '1/4-20 x 100 3/4 hex cap screw'],
    ['M8 BHCS x 100 each', 'm8 bhcs x 100'],
  ])('keeps the separator-bound number in %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  // What the choice costs, stated rather than left to be found: the unit-marked length the
  // same query carries is the one that falls to the residue.
  it('lets the separator-bound number take the length slot from a unit-marked one', () => {
    const { spec } = parseQuery('M8 x 5 ea 50mm BHCS');

    expect(spec.length).toMatchObject({ value: 5, unit: 'mm' });
    expect(spec.residue).toContain('50mm');
  });
});

// H2: a designator is a number too, so a quantity word reaches for it exactly as it
// reaches for a length, and the space is the only thing that tells `ISO 7380` from
// `ISO7380`. The expected values are the ones the query states, not the parser's.
describe('the spelling of an unrelated standard changes nothing (H2)', () => {
  it.each([
    'M8 x 50 each BHCS ISO 7380',
    'M8 x 50 each BHCS ISO7380',
    'M8 x 50 BHCS ISO 7380 each',
    'M8 x 50 BHCS ISO7380 each',
    'M8 x 50 BHCS ISO 7380 qty 100',
    'M8 x 50 BHCS ISO7380 100 pcs',
  ])('reads 50mm and ISO 7380 out of %s', (query) => {
    const { spec } = parseQuery(query);

    expect(spec.standard).toBe('ISO 7380');
    expect(spec.length).toMatchObject({ value: 50, unit: 'mm' });
  });

  it.each([
    ['M8 BHCS DIN 125 ea', 'DIN 125'],
    ['M8 BHCS DIN125 ea', 'DIN 125'],
    ['M8 hex nut IFI 111 each', 'IFI 111'],
    ['M8 hex nut IFI111 each', 'IFI 111'],
  ])('keeps the standard of %s whole', (query, standard) => {
    expect(parseQuery(query).spec.standard).toBe(standard);
  });

  it('reads the same standard and length whichever spelling and wherever the quantity lands', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...QUANTITY_RUNS),
        fc.constantFrom(...PLACEMENTS),
        (phrase, placement) => {
          const base = baseTokens('50', true);
          const spaced = parseQuery(assemble(base, ['iso', '7380'], phrase, placement)).spec;
          const compact = parseQuery(assemble(base, ['iso7380'], phrase, placement)).spec;

          expect(spaced.standard).toBe('ISO 7380');
          expect(compact.standard).toBe('ISO 7380');
          expect(spaced.length?.mm).toBe(50);
          expect(compact.length?.mm).toBe(50);
        },
      ),
    );
  });
});

// The cross is enumerated rather than sampled: at the positions a person writes, both
// invariants are owed on every combination, and a generator that visits a fifth of them
// is how a round passes and ships the case it never drew.
function cross<T>(runs: readonly T[]): {
  dimension: Dimension;
  xBound: boolean;
  standard: Standard;
  run: T;
  placement: Placement;
}[] {
  return DIMENSIONS.flatMap((dimension) =>
    [false, true].flatMap((xBound) =>
      STANDARDS.flatMap((standard) =>
        runs.flatMap((run) =>
          PLACEMENTS.map((placement) => ({ dimension, xBound, standard, run, placement })),
        ),
      ),
    ),
  );
}

describe('both invariants at the positions a person writes', () => {
  it.each(cross(NUMBERED_PHRASES))(
    'drops $run.label and keeps $dimension.label and the $standard.label standard, $placement, x-bound $xBound',
    ({ dimension, xBound, standard, run, placement }) => {
      const base = baseTokens(dimension.token, xBound);
      const words = wordsOf(assemble(base, standard.tokens, run.tokens, placement));

      expect(words).toContain(dimension.token);
      expect(words).not.toContain(run.number);
      for (const token of standard.tokens) expect(words).toContain(token);
    },
  );

  // A bare word has no number of its own, so the only thing it can take is a bare run of
  // digits nothing stands in front of. Every other spelling comes through untouched; the
  // bare integer it can take is the withdrawn case pinned above.
  it.each(cross(BARE_WORDS))(
    'bare $run keeps $dimension.label and the $standard.label standard, $placement, x-bound $xBound',
    ({ dimension, xBound, standard, run, placement }) => {
      const base = baseTokens(dimension.token, xBound);
      const words = wordsOf(assemble(base, standard.tokens, [run], placement));

      expect(words).not.toContain(run);
      for (const token of standard.tokens) expect(words).toContain(token);
      if (!dimension.bare || xBound) expect(words).toContain(dimension.token);
    },
  );
});

// `x` is ordering shorthand as often as it is a size separator: `hex nut x 100 pcs` is a
// count said twice over, and a query a person writes, so it is asserted here rather than
// among the contrived indexes. The adverbs are the half that must not follow.
interface Shorthand {
  tokens: readonly string[];
  number: string;
  counts: boolean;
  label: string;
}

const SHORTHAND_RUNS: readonly Shorthand[] = [
  { tokens: ['x', '100', 'pcs'], number: '100', counts: true, label: 'x 100 pcs' },
  { tokens: ['x', '100', 'pc'], number: '100', counts: true, label: 'x 100 pc' },
  { tokens: ['x', '2', 'pieces'], number: '2', counts: true, label: 'x 2 pieces' },
  { tokens: ['x', '2', 'piece'], number: '2', counts: true, label: 'x 2 piece' },
  { tokens: ['x', '100', 'qty'], number: '100', counts: true, label: 'x 100 qty' },
  { tokens: ['x', '100', 'each'], number: '100', counts: false, label: 'x 100 each' },
  { tokens: ['x', '5', 'ea'], number: '5', counts: false, label: 'x 5 ea' },
];

// Ordering shorthand trails the item or follows the type; nobody opens a request with it.
const SHORTHAND_PLACEMENTS = ['trailing', 'afterProduct'] as const satisfies readonly Placement[];

// Following the type puts the run in front of a loose bare integer, where the word has a
// number on each side and the governed direction decides instead. That is the two-number
// case, pinned on its own below, not order shorthand.
const isShorthand = (dimension: Dimension, xBound: boolean, placement: Placement): boolean =>
  placement !== 'afterProduct' || xBound || !dimension.bare;

describe('the order shorthand `x <n> <word>` at the positions a person writes', () => {
  it.each([
    ['M8 hex nut x 100 pcs', 'm8 hex nut x'],
    ['M8 BHCS x 100 pcs', 'm8 bhcs x'],
    ['M8 x 100 pcs 50mm BHCS', 'm8 x 50mm bhcs'],
    ['M8 x 2 pieces 50mm BHCS', 'm8 x 50mm bhcs'],
    ['1/4-20 x 100 pcs 3/4 hex cap screw', '1/4-20 x 3/4 hex cap screw'],
    ['1/4-20 x 2 pieces 3/4 hex cap screw', '1/4-20 x 3/4 hex cap screw'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalize(input).canonical).toBe(expected);
  });

  it.each(
    DIMENSIONS.flatMap((dimension) =>
      [false, true].flatMap((xBound) =>
        STANDARDS.flatMap((standard) =>
          SHORTHAND_RUNS.flatMap((run) =>
            SHORTHAND_PLACEMENTS.filter((placement) =>
              isShorthand(dimension, xBound, placement),
            ).map((placement) => ({ dimension, xBound, standard, run, placement })),
          ),
        ),
      ),
    ),
  )(
    '$run.label on $dimension.label with the $standard.label standard, $placement, x-bound $xBound',
    ({ dimension, xBound, standard, run, placement }) => {
      const base = baseTokens(dimension.token, xBound);
      const words = wordsOf(assemble(base, standard.tokens, run.tokens, placement));

      expect(words).toContain(dimension.token);
      for (const token of standard.tokens) expect(words).toContain(token);
      if (run.counts) expect(words).not.toContain(run.number);
      else expect(words).toContain(run.number);
    },
  );

  it.each([
    ['M8 BHCS x 100 qty 50', 'm8 bhcs x 100'],
    ['M8 BHCS x 100 each 50', 'm8 bhcs x 50'],
    ['M8 BHCS x 5 ea 50', 'm8 bhcs x 50'],
    ['M8 BHCS x 100 pcs 50', 'm8 bhcs x 50'],
  ])(
    'lets the governed direction decide in %s, where both sides are numbers',
    (input, expected) => {
      expect(normalize(input).canonical).toBe(expected);
    },
  );
});

// At an index nobody would write, only the weaker invariant is owed: the quantity number
// must not survive as a dimension. It is unavailable where the number lands behind a
// standard body, or behind the separator with an adverb reaching for it, so those are
// skipped; a count noun behind the separator is asserted like any other.
describe('the weaker invariant at every index, contrived ones included', () => {
  it('never lets a quantity number survive an insertion the separator does not bind', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DIMENSIONS.map((dimension) => dimension.token), undefined),
        fc.boolean(),
        fc.constantFrom(...STANDARDS),
        fc.constantFrom(...NUMBERED_PHRASES),
        fc.nat(),
        (dimension, xBound, standard, phrase, rawIndex) => {
          const carrier = [...baseTokens(dimension, xBound), ...standard.tokens];
          const index = rawIndex % (carrier.length + 1);
          const assembled = [...carrier.slice(0, index), ...phrase.tokens, ...carrier.slice(index)];
          const inFront = assembled[index + phrase.tokens.indexOf(phrase.number) - 1];

          fc.pre(
            !STANDARD_BODIES.has(inFront ?? '') &&
              !(inFront === 'x' && DISTRIBUTIVE_WORDS.has(phrase.word)),
          );

          expect(wordsOf(assembled.join(' '))).not.toContain(phrase.number);
        },
      ),
    );
  });

  // `qty` always precedes its number, so nothing can ever stand between them: this half of
  // the sweep owes no exception at all.
  it('never lets `qty N` survive any insertion at all', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...DIMENSIONS.map((dimension) => dimension.token), undefined),
        fc.boolean(),
        fc.constantFrom(...STANDARDS),
        fc.constantFrom('100', '5', '200'),
        fc.nat(),
        (dimension, xBound, standard, number, rawIndex) => {
          const carrier = [...baseTokens(dimension, xBound), ...standard.tokens];
          const index = rawIndex % (carrier.length + 1);
          const query = [...carrier.slice(0, index), 'qty', number, ...carrier.slice(index)];

          expect(wordsOf(query.join(' '))).not.toContain(number);
        },
      ),
    );
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
