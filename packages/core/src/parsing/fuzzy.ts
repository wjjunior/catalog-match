import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import { LEXICON, PROTECTED_CODES } from './lexicon';

const { fuzzyStrength } = DEFAULT_MATCHER_CONFIG;

const MAX_TOKEN_LENGTH = 64;

const ROW_A = new Int32Array(MAX_TOKEN_LENGTH + 1);
const ROW_B = new Int32Array(MAX_TOKEN_LENGTH + 1);
const ROW_C = new Int32Array(MAX_TOKEN_LENGTH + 1);

interface DistanceRows {
  current: Int32Array;
  previous: Int32Array;
  twoBack: Int32Array;
  over: number;
}

function trivialDistance(a: string, b: string, max: number): number | undefined {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length > MAX_TOKEN_LENGTH || b.length > MAX_TOKEN_LENGTH) return max + 1;

  return undefined;
}

function cellDistance(a: string, b: string, i: number, j: number, rows: DistanceRows): number {
  const { current, previous, twoBack, over } = rows;
  const cost = a[i - 1] === b[j - 1] ? 0 : 1;

  let best = Math.min(
    (current[j - 1] ?? over) + 1,
    (previous[j] ?? over) + 1,
    (previous[j - 1] ?? over) + cost,
  );

  if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
    best = Math.min(best, (twoBack[j - 2] ?? over) + 1);
  }

  return best;
}

function fillRow(a: string, b: string, i: number, max: number, rows: DistanceRows): number {
  const { current, over } = rows;
  const lo = Math.max(1, i - max);
  const hi = Math.min(b.length, i + max);

  current[0] = i <= max ? i : over;
  if (lo > 1) current[lo - 1] = over;
  if (hi < b.length) current[hi + 1] = over;

  let rowBest = over;

  for (let j = lo; j <= hi; j++) {
    const best = cellDistance(a, b, i, j, rows);
    current[j] = best;
    if (best < rowBest) rowBest = best;
  }

  return rowBest;
}

/** The three row buffers are module-level and reused by every call: safe only because
 * this is synchronous, so no two frames are ever live at once. */
export function damerauLevenshtein(a: string, b: string, max = Infinity): number {
  const trivial = trivialDistance(a, b, max);
  if (trivial !== undefined) return trivial;

  const width = b.length + 1;
  const over = Math.min(max + 1, MAX_TOKEN_LENGTH);
  const rows: DistanceRows = { current: ROW_C, previous: ROW_B, twoBack: ROW_A, over };

  rows.twoBack.fill(over, 0, width);
  rows.current.fill(over, 0, width);
  rows.previous.fill(over, 0, width);
  for (let j = 0; j <= Math.min(b.length, max); j++) rows.previous[j] = j;

  for (let i = 1; i <= a.length; i++) {
    const rowBest = fillRow(a, b, i, max, rows);
    if (rowBest > max) return over;

    const spare = rows.twoBack;
    rows.twoBack = rows.previous;
    rows.previous = rows.current;
    rows.current = spare;
  }

  return rows.previous[b.length] ?? over;
}

const MIN_LENGTH = 4;
const LONG_WORD_LENGTH = 8;

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

function pickOne(candidates: readonly string[]): string | undefined {
  if (candidates.length <= 1) return candidates[0];

  const longest = Math.max(...candidates.map((word) => word.length));
  const winners = candidates.filter((word) => word.length === longest);

  return winners.length === 1 ? winners[0] : undefined;
}
