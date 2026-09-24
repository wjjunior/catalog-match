import { STANDARD_BODIES } from './lexicon';

export interface NormalizedToken {
  text: string;
  start: number;
  end: number;
}

export type NormalizationNote = 'quantityStripped' | 'noiseStripped';

export interface NormalizedText {
  canonical: string;
  tokens: NormalizedToken[];
  notes: NormalizationNote[];
}

const UNICODE_FRACTIONS: Readonly<Record<string, string>> = {
  '¼': '1/4',
  '½': '1/2',
  '¾': '3/4',
  '⅜': '3/8',
  '⅝': '5/8',
};

const FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
const SIZE_CHAR = `0-9"'/″”’${FRACTION_CHARS}`;

const INNER_SEPARATOR = new RegExp(String.raw`(?<=[${SIZE_CHAR}])[x×](?=\d)`, 'g');
const TRAILING_SEPARATOR = new RegExp(`[${SIZE_CHAR}][x×]$`);
const LEADING_SEPARATOR = /^[x×]\d/;
const ENDS_WITH_SIZE_CHAR = new RegExp(`[${SIZE_CHAR}]$`);
const FRACTION = new RegExp(String.raw`(\d?)([${FRACTION_CHARS}])`, 'g');

const TRAILING_PUNCTUATION = new Set([',', '.', ';', ':', '!', '?']);

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  inch: 'in',
  inches: 'in',
  'in.': 'in',
  in: 'in',
  foot: 'ft',
  feet: 'ft',
  ft: 'ft',
  millimeter: 'mm',
  millimeters: 'mm',
  millimetre: 'mm',
  millimetres: 'mm',
  mm: 'mm',
};

const UNIT_ALTERNATION = Object.keys(UNIT_ALIASES)
  .join('|')
  .replaceAll('.', String.raw`\.`);
const GLUED_UNIT = new RegExp(String.raw`^(\d[\d./-]*?)(${UNIT_ALTERNATION})$`);

const NUMBER_WORDS = new Set(['#', 'no.', 'no', 'number']);

const SINGULARS: Readonly<Record<string, string>> = {
  nuts: 'nut',
  washers: 'washer',
  screws: 'screw',
  bolts: 'bolt',
  rods: 'rod',
  studs: 'stud',
};

const QUANTITY_WORDS = new Set(['pcs', 'pc', 'pieces', 'piece', 'ea', 'each', 'qty']);
const QUANTITY_WORDS_TAKING_FOLLOWING_NUMBER = new Set(['qty']);
const DISTRIBUTIVE_WORDS = new Set(['ea', 'each']);
const NOISE_WORDS = new Set(['please', 'quote', 'need', 'want']);
const NOTE_ORDER: readonly NormalizationNote[] = ['quantityStripped', 'noiseStripped'];

function slice(token: NormalizedToken, from: number, to: number): NormalizedToken {
  return { text: token.text.slice(from, to), start: token.start + from, end: token.start + to };
}

function stripTrailingPunctuation(text: string): string {
  let end = text.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(text[end - 1] ?? '')) end -= 1;
  return text.slice(0, end);
}

function tokenize(input: string): NormalizedToken[] {
  return [...input.matchAll(/\S+/g)]
    .map((match) => {
      const text = stripTrailingPunctuation(match[0].toLowerCase());

      return { text, start: match.index, end: match.index + text.length };
    })
    .filter((token) => token.text !== '');
}

function separatorOffsets(
  token: NormalizedToken,
  previous: NormalizedToken | undefined,
  next: NormalizedToken | undefined,
): number[] {
  const offsets = new Set([...token.text.matchAll(INNER_SEPARATOR)].map((match) => match.index));

  if (next && /^\d/.test(next.text) && TRAILING_SEPARATOR.test(token.text)) {
    offsets.add(token.text.length - 1);
  }
  if (previous && ENDS_WITH_SIZE_CHAR.test(previous.text) && LEADING_SEPARATOR.test(token.text)) {
    offsets.add(0);
  }

  return [...offsets].sort((a, b) => a - b);
}

// Runs before any rewrite, while token offsets still map one to one onto the input.
function splitSeparators(tokens: NormalizedToken[]): NormalizedToken[] {
  return tokens.flatMap((token, index) => {
    const offsets = separatorOffsets(token, tokens[index - 1], tokens[index + 1]);
    if (offsets.length === 0) return [{ ...token, text: token.text.replaceAll('×', 'x') }];

    const parts: NormalizedToken[] = [];
    let cursor = 0;

    for (const offset of offsets) {
      if (offset > cursor) parts.push(slice(token, cursor, offset));
      parts.push({ ...slice(token, offset, offset + 1), text: 'x' });
      cursor = offset + 1;
    }
    if (cursor < token.text.length) parts.push(slice(token, cursor, token.text.length));

    return parts;
  });
}

function rewriteCharacters(text: string): string {
  return text
    .replaceAll(/[’‘]/g, "'")
    .replaceAll("''", '"')
    .replaceAll(/[″”“]/g, '"')
    .replaceAll(FRACTION, (match: string, digit: string, fraction: string) => {
      const ascii = UNICODE_FRACTIONS[fraction];
      if (ascii === undefined) return match;

      return digit ? `${digit}-${ascii}` : ascii;
    });
}

function applyUnitAlias(text: string): string {
  const alias = UNIT_ALIASES[text];
  if (alias !== undefined) return alias;

  const glued = GLUED_UNIT.exec(text);
  if (glued === null) return text;

  const [, number = '', unit = ''] = glued;
  const canonical = UNIT_ALIASES[unit];

  return canonical === undefined ? text : `${number}${canonical}`;
}

function mergeNumberWords(tokens: NormalizedToken[]): NormalizedToken[] {
  const merged: NormalizedToken[] = [];
  let skipMerged = false;

  for (const [index, token] of tokens.entries()) {
    if (skipMerged) {
      skipMerged = false;
      continue;
    }

    const next = tokens[index + 1];

    if (NUMBER_WORDS.has(token.text) && next && /^\d/.test(next.text)) {
      merged.push({ text: `#${next.text}`, start: token.start, end: next.end });
      skipMerged = true;
      continue;
    }

    merged.push(token);
  }

  return merged;
}

function isNumberToken(token: NormalizedToken | undefined): boolean {
  return token !== undefined && /^\d+$/.test(token.text);
}

// `x` is ordering shorthand as often as it is a size separator, so `hex nut x 100 pcs` is
// a count twice over; only the adverbs leave it standing as a dimension.
function boundByPrevious(tokens: NormalizedToken[], index: number, word: string): boolean {
  const previous = tokens[index - 1]?.text;
  if (previous === undefined) return false;

  return STANDARD_BODIES.has(previous) || (previous === 'x' && DISTRIBUTIVE_WORDS.has(word));
}

function loneQuantityIndex(
  index: number,
  hasBefore: boolean,
  hasAfter: boolean,
): number | undefined {
  if (hasBefore) return index - 1;
  if (hasAfter) return index + 1;
  return undefined;
}

function claimedQuantityNumbers(tokens: NormalizedToken[]): Set<number> {
  const claimed = new Set<number>();

  tokens.forEach((token, index) => {
    if (!QUANTITY_WORDS.has(token.text)) return;

    const hasBefore = isNumberToken(tokens[index - 1]);
    const hasAfter = isNumberToken(tokens[index + 1]);

    if (hasBefore && hasAfter) {
      claimed.add(QUANTITY_WORDS_TAKING_FOLLOWING_NUMBER.has(token.text) ? index + 1 : index - 1);
      return;
    }

    const lone = loneQuantityIndex(index, hasBefore, hasAfter);
    if (lone !== undefined && !boundByPrevious(tokens, lone, token.text)) claimed.add(lone);
  });

  return claimed;
}

function stripQuantitiesAndNoise(tokens: NormalizedToken[]): NormalizedText {
  const claimedNumbers = claimedQuantityNumbers(tokens);

  const dropped = tokens.map((token, index) => {
    if (QUANTITY_WORDS.has(token.text)) return 'quantityStripped' as const;
    if (NOISE_WORDS.has(token.text)) return 'noiseStripped' as const;
    if (claimedNumbers.has(index)) return 'quantityStripped' as const;
    return undefined;
  });

  tokens.forEach((token, index) => {
    if (token.text === 'of') dropped[index] ??= dropped[index - 1] ?? dropped[index + 1];
  });

  const kept = tokens.filter((_token, index) => dropped[index] === undefined);

  return {
    canonical: kept.map((token) => token.text).join(' '),
    tokens: kept,
    notes: NOTE_ORDER.filter((note) => dropped.includes(note)),
  };
}

export function normalize(text: string): NormalizedText {
  const rewritten = splitSeparators(tokenize(text)).map((token) => ({
    ...token,
    text: applyUnitAlias(rewriteCharacters(token.text)),
  }));

  const tokens = mergeNumberWords(rewritten).map((token) => ({
    ...token,
    text: SINGULARS[token.text] ?? token.text,
  }));

  return stripQuantitiesAndNoise(tokens);
}
