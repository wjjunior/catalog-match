import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { LEXICON, PROTECTED_CODES } from './lexicon';

const { fuzzyStrength } = DEFAULT_MATCHER_CONFIG;

/** Optimal string alignment: like Levenshtein, but an adjacent transposition costs one
 * edit, so "haed" sits one step from "head". */
/** Longer than any catalog or query word, so the row buffers never need resizing. */
const MAX_TOKEN_LENGTH = 64;

// Reused across calls: correct() runs this hundreds of thousands of times per scan and
// the allocations dominated the cost. Safe because the function is synchronous.
const ROW_A = new Int32Array(MAX_TOKEN_LENGTH + 1);
const ROW_B = new Int32Array(MAX_TOKEN_LENGTH + 1);
const ROW_C = new Int32Array(MAX_TOKEN_LENGTH + 1);

/**
 * Optimal string alignment: like Levenshtein, but an adjacent transposition costs one
 * edit, so "haed" sits one step from "head".
 *
 * `max` bounds the answer: the distance is exact while it fits, and once every alignment
 * has already exceeded `max` the function stops and returns a larger number. Scanning a
 * vocabulary spends most of its time on words that are nowhere near, and this is what
 * makes that cheap.
 */
/**
 * Optimal string alignment: like Levenshtein, but an adjacent transposition costs one
 * edit, so "haed" sits one step from "head".
 *
 * `max` bounds the answer: the distance is exact while it fits, and a larger number comes
 * back once it cannot. Only cells within `max` of the diagonal are computed, because no
 * alignment reaches further without already spending more than `max` edits. Scanning a
 * vocabulary spends most of its time on words that are nowhere near, and this is what
 * makes that cheap.
 */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length > MAX_TOKEN_LENGTH || b.length > MAX_TOKEN_LENGTH) return max + 1;

  const width = b.length + 1;
  // The bound only ever has to separate "within max" from "beyond it".
  const over = Math.min(max + 1, MAX_TOKEN_LENGTH);
  let twoBack = ROW_A;
  let previous = ROW_B;
  let current = ROW_C;

  twoBack.fill(over, 0, width);
  current.fill(over, 0, width);
  previous.fill(over, 0, width);
  for (let j = 0; j <= Math.min(b.length, max); j++) previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const lo = Math.max(1, i - max);
    const hi = Math.min(b.length, i + max);

    current[0] = i <= max ? i : over;
    if (lo > 1) current[lo - 1] = over;
    if (hi < b.length) current[hi + 1] = over;

    let rowBest = over;

    for (let j = lo; j <= hi; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      let best = Math.min(
        (current[j - 1] ?? over) + 1,
        (previous[j] ?? over) + 1,
        (previous[j - 1] ?? over) + cost,
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (twoBack[j - 2] ?? over) + 1);
      }

      current[j] = best;
      if (best < rowBest) rowBest = best;
    }

    if (rowBest > max) return over;

    const spare = twoBack;
    twoBack = previous;
    previous = current;
    current = spare;
  }

  return previous[b.length] ?? over;
}

const MIN_LENGTH = 4;
const LONG_WORD_LENGTH = 8;

/** Every single word of every lexicon phrase. */
export const VOCABULARY: ReadonlySet<string> = new Set(
  [...LEXICON.keys()].flatMap((phrase) => phrase.split(' ')),
);

export interface Correction {
  word: string;
  distance: number;
  strength: number;
}

export function correct(
  token: string,
  vocabulary: ReadonlySet<string> = VOCABULARY,
  protectedCodes: ReadonlySet<string> = PROTECTED_CODES,
): Correction | null {
  if (!/^[a-z]+$/.test(token)) return null;
  if (token.length < MIN_LENGTH) return null;
  if (vocabulary.has(token) || protectedCodes.has(token)) return null;

  const maxDistance = token.length >= LONG_WORD_LENGTH ? 2 : 1;

  let nearest: string[] = [];
  let nearestDistance = maxDistance;

  for (const word of vocabulary) {
    if (Math.abs(word.length - token.length) > maxDistance) continue;

    const distance = damerauLevenshtein(token, word, maxDistance);
    if (distance > nearestDistance) continue;

    if (distance < nearestDistance || nearest.length === 0) {
      nearest = [word];
      nearestDistance = distance;
    } else {
      nearest.push(word);
    }
  }

  const word = pickOne(nearest);
  return word ? { word, distance: nearestDistance, strength: fuzzyStrength } : null;
}

/**
 * The catalog abbreviates its own words, so a typo can sit one edit from both a word and
 * its abbreviation: washr is next to washer and to wshr. Those mean the same product, so
 * the longer spelling wins. Words of equal length are a real ambiguity and yield nothing,
 * which also keeps the result independent of iteration order.
 */
function pickOne(candidates: readonly string[]): string | undefined {
  if (candidates.length <= 1) return candidates[0];

  const longest = Math.max(...candidates.map((word) => word.length));
  const winners = candidates.filter((word) => word.length === longest);

  return winners.length === 1 ? winners[0] : undefined;
}
