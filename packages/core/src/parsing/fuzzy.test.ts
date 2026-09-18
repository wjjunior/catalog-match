import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { PROTECTED_CODES } from './lexicon';
import { VOCABULARY, correct, damerauLevenshtein } from './fuzzy';

describe('damerauLevenshtein', () => {
  it('is zero for identical words', () => {
    expect(damerauLevenshtein('washer', 'washer')).toBe(0);
  });

  it('counts a substitution as one', () => {
    expect(damerauLevenshtein('washer', 'wesher')).toBe(1);
  });

  it('counts a deletion as one', () => {
    expect(damerauLevenshtein('washer', 'washr')).toBe(1);
  });

  it('counts an insertion as one', () => {
    expect(damerauLevenshtein('nut', 'nutt')).toBe(1);
  });

  it('counts a transposition of adjacent letters as one, not two', () => {
    expect(damerauLevenshtein('head', 'haed')).toBe(1);
  });

  it('counts two independent edits as two', () => {
    expect(damerauLevenshtein('washer', 'wshar')).toBe(2);
  });

  it('is the length of the other word when one is empty', () => {
    expect(damerauLevenshtein('', 'screw')).toBe(5);
    expect(damerauLevenshtein('screw', '')).toBe(5);
  });

  it('returns the exact distance when it is within the given bound', () => {
    expect(damerauLevenshtein('washer', 'washr', 1)).toBe(1);
    expect(damerauLevenshtein('head', 'haed', 1)).toBe(1);
    expect(damerauLevenshtein('washer', 'washer', 1)).toBe(0);
  });

  it('reports a value above the bound instead of the exact distance when it exceeds it', () => {
    expect(damerauLevenshtein('washer', 'wshar', 1)).toBeGreaterThan(1);
    expect(damerauLevenshtein('screw', 'plain', 1)).toBeGreaterThan(1);
  });

  it('agrees with the unbounded distance whenever that distance fits the bound', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.integer({ min: 0, max: 4 }), (a, b, max) => {
        const exact = damerauLevenshtein(a, b);
        const bounded = damerauLevenshtein(a, b, max);

        if (exact <= max) expect(bounded).toBe(exact);
        else expect(bounded).toBeGreaterThan(max);
      }),
    );
  });

  it('is symmetric', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(damerauLevenshtein(a, b)).toBe(damerauLevenshtein(b, a));
      }),
    );
  });

  it('is zero only for equal words', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(damerauLevenshtein(a, b) === 0).toBe(a === b);
      }),
    );
  });

  it('never exceeds the length of the longer word', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        expect(damerauLevenshtein(a, b)).toBeLessThanOrEqual(Math.max(a.length, b.length));
      }),
    );
  });
});

describe('correct', () => {
  it.each([
    ['nutt', 'nut'],
    ['haed', 'head'],
    ['washr', 'washer'],
    ['screww', 'screw'],
    ['bolr', 'bolt'],
  ])('corrects %s to %s', (token, expected) => {
    expect(correct(token)?.word).toBe(expected);
  });

  it('reports the distance and the configured strength', () => {
    expect(correct('washr')).toEqual({
      word: 'washer',
      distance: 1,
      strength: DEFAULT_MATCHER_CONFIG.fuzzyStrength,
    });
  });

  it.each(['socket', 'washer', 'screw', 'plain'])('leaves %s alone, it is a known word', (word) => {
    expect(correct(word)).toBeNull();
  });

  it.each(['ss', 'zn', 'hdg', 'nut', 'hex'])('leaves the short code %s alone', (code) => {
    expect(correct(code)).toBeNull();
  });

  it.each(['m8', '12mm', '1/2', '3/4"', 'x', '18-8', 'a307'])(
    'never touches %s, which is not an alphabetic word',
    (token) => {
      expect(correct(token)).toBeNull();
    },
  );

  it('leaves a three-letter typo alone, since the rule starts at four', () => {
    expect(correct('nvt')).toBeNull();
  });

  it('refuses a distance of two below eight letters', () => {
    expect(correct('abxdy', new Set(['abcde']))).toBeNull();
  });

  it('allows a distance of two from eight letters up', () => {
    expect(correct('galvinised')).toEqual({
      word: 'galvanized',
      distance: 2,
      strength: DEFAULT_MATCHER_CONFIG.fuzzyStrength,
    });
  });

  it('returns null rather than guessing when two words of equal length tie', () => {
    expect(correct('bolx', new Set(['bolt', 'bola']))).toBeNull();
  });

  it('takes the longer word when the tied words differ in length', () => {
    expect(correct('bolx', new Set(['bolt', 'boltx']))?.word).toBe('boltx');
  });

  // wshr is a catalog abbreviation, so washr sits one edit from two known words. They
  // mean the same product, and dropping the correction would cost "flat washr" its type.
  it('corrects washr to washer rather than to the shorter wshr', () => {
    expect(correct('washr')?.word).toBe('washer');
    expect(VOCABULARY.has('wshr')).toBe(true);
  });

  it('picks the nearer word when one is strictly closer', () => {
    expect(correct('bolx', new Set(['bolt', 'bolero']))?.word).toBe('bolt');
  });

  it('leaves a protected code alone even when it is not a known word', () => {
    expect(correct('astm', new Set(['asme']))).toBeNull();
  });

  it('never returns a word for a token nothing is near', () => {
    expect(correct('zzzzzz')).toBeNull();
  });
});

describe('the vocabulary', () => {
  it('is derived from the lexicon phrases', () => {
    expect(VOCABULARY.has('washer')).toBe(true);
    expect(VOCABULARY.has('phillips')).toBe(true);
    expect(VOCABULARY.has('b18.2.1')).toBe(true);
    expect(VOCABULARY.has('socket head cap screw')).toBe(false);
  });

  it('never corrects a word it already contains', () => {
    for (const word of VOCABULARY) {
      expect(correct(word)).toBeNull();
    }
  });

  // The length rule already covers fourteen of the sixteen codes, and every code is a
  // lexicon word, so the protected list is a guard for a future smaller lexicon rather
  // than an active rule. This keeps that true.
  it('contains every protected code', () => {
    for (const code of PROTECTED_CODES) {
      expect(VOCABULARY.has(code)).toBe(true);
    }
  });
});

describe('performance', () => {
  // Alphabetic words only: a token with a digit is rejected on the first line and would
  // measure nothing. Half correct, half are near-misses that scan the vocabulary and fail.
  const SAMPLE = [
    'washr',
    'nutt',
    'haed',
    'bolr',
    'screww',
    'galvinised',
    'sprung',
    'plane',
    'blacke',
    'threded',
  ];

  it('runs ten thousand corrections in well under 100 ms', () => {
    const tokens = Array.from({ length: 10_000 }, (_, i) => SAMPLE[i % SAMPLE.length] ?? '');

    const started = performance.now();
    let corrected = 0;
    for (const token of tokens) if (correct(token)) corrected++;
    const elapsed = performance.now() - started;

    expect(corrected).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
