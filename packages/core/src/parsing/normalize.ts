export interface NormalizedToken {
  text: string;
  /** Offsets into the original input, so evidence can quote what the user wrote. */
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

// Anchored between size characters: a bare replacement would cut `hex` into `he x`.
const INNER_SEPARATOR = new RegExp(`(?<=[${SIZE_CHAR}])[x×](?=[0-9])`, 'g');
const TRAILING_SEPARATOR = new RegExp(`[${SIZE_CHAR}][x×]$`);
const LEADING_SEPARATOR = /^[x×][0-9]/;
const ENDS_WITH_SIZE_CHAR = new RegExp(`[${SIZE_CHAR}]$`);
const FRACTION = new RegExp(`(\\d?)([${FRACTION_CHARS}])`, 'g');

// Trailing only: a standard carries its periods inside (`b18.2.1`) and a size needs the
// marks SIZE_CHAR claims, so neither may be read as the end of a sentence.
const TRAILING_PUNCTUATION = /[,.;:!?]+$/;

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

// Whole tokens only, plus a unit glued to a number: `zinc` ends in a unit alias and
// must survive untouched.
const GLUED_UNIT = new RegExp(
  `^(\\d[\\d./-]*?)(${Object.keys(UNIT_ALIASES).join('|').replace(/\./g, '\\.')})$`,
);

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
const NOISE_WORDS = new Set(['please', 'quote', 'need', 'want']);
const NOTE_ORDER: readonly NormalizationNote[] = ['quantityStripped', 'noiseStripped'];

function slice(token: NormalizedToken, from: number, to: number): NormalizedToken {
  return { text: token.text.slice(from, to), start: token.start + from, end: token.start + to };
}

function tokenize(input: string): NormalizedToken[] {
  return [...input.matchAll(/\S+/g)]
    .map((match) => {
      const text = match[0].toLowerCase().replace(TRAILING_PUNCTUATION, '');

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

  // The catalog writes `1/2-13X 3"` and `1/2-13 x3"`: the separator is glued to one side
  // only, so the digit that anchors it sits in the neighbouring token.
  if (next && /^[0-9]/.test(next.text) && TRAILING_SEPARATOR.test(token.text)) {
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
    if (offsets.length === 0) return [{ ...token, text: token.text.replace(/×/g, 'x') }];

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
    .replace(/[’‘]/g, "'")
    .replace(/''/g, '"')
    .replace(/[″”“]/g, '"')
    .replace(FRACTION, (match: string, digit: string, fraction: string) => {
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

    if (NUMBER_WORDS.has(token.text) && next && /^[0-9]/.test(next.text)) {
      merged.push({ text: `#${next.text}`, start: token.start, end: next.end });
      skipMerged = true;
      continue;
    }

    merged.push(token);
  }

  return merged;
}

function stripQuantitiesAndNoise(tokens: NormalizedToken[]): NormalizedText {
  const isQuantityWord = (token: NormalizedToken | undefined): boolean =>
    token !== undefined && QUANTITY_WORDS.has(token.text);

  const dropped = tokens.map((token, index) => {
    if (QUANTITY_WORDS.has(token.text)) return 'quantityStripped' as const;
    if (NOISE_WORDS.has(token.text)) return 'noiseStripped' as const;
    // A bare integer is a quantity only when a quantity word binds it, and only when the
    // separator has not bound it first: the 50 of `m8 x 50 qty 100` must survive.
    if (
      /^\d+$/.test(token.text) &&
      tokens[index - 1]?.text !== 'x' &&
      (isQuantityWord(tokens[index - 1]) || isQuantityWord(tokens[index + 1]))
    ) {
      return 'quantityStripped' as const;
    }
    return undefined;
  });

  // `of` carries nothing on its own; it goes only with the quantity phrase it belongs to,
  // which is what `200 pcs of m8` needs and what leaves `box of m8` alone.
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
