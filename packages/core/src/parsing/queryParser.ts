import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
} from '../domain/attributes';
import type { QueryParser } from '../domain/contracts';
import { DIAMETERS } from '../domain/diameters';
import type {
  AttributeName,
  Diameter,
  Length,
  ParsedSpec,
  Provenance,
  Weighted,
} from '../domain/spec';
import { INTENT_PHRASES } from '../personalization/intent';
import { correct } from './fuzzy';
import { STANDARD_BODIES, longestMatch, type LexiconValue } from './lexicon';
import { normalize } from './normalize';
import {
  classifySizeToken,
  parseNumber,
  resolveDiameter,
  resolveLength,
  toMm,
  type SizeToken,
} from './units';

export interface QueryParse {
  spec: ParsedSpec;
  /** The intent detector (docs/DESIGN.md 7.4, PRG-25) owns these words. They are
   * recognised here only so they never reach the residue, and reported so the same scan
   * that dropped them is the one that names them. */
  intentCandidates: string[];
}

type ThreadToken = Extract<SizeToken, { kind: 'thread' }>;

interface Token {
  text: string;
  /** The normalized word before any correction: residue and evidence quote the user. */
  original: string;
  start: number;
  end: number;
  correction?: number;
}

interface SizeSlot {
  size: SizeToken;
  from: number;
  to: number;
}

interface Draft {
  query: string;
  tokens: Token[];
  claimed: Set<number>;
  evidence: Partial<Record<AttributeName, string>>;
  provenance: Partial<Record<AttributeName, Provenance>>;
}

const SEPARATOR = 'x';

/** Everything normalization leaves a unit as, plus the inch mark it may leave standing
 * alone when the user put a space before it. */
const UNIT_TOKENS: ReadonlySet<string> = new Set(['in', 'ft', 'mm', '"']);

const MAX_INTENT_TOKENS = Math.max(...INTENT_PHRASES.map((phrase) => phrase.split(' ').length));

/** `125`, `a307`, `b18.2.1`: the designator half of a standard, never a whole standard. */
const DESIGNATOR_SHAPE = '[a-z]?\\d+(?:\\.\\d+)*[a-z]?';

const DESIGNATOR = new RegExp(`^${DESIGNATOR_SHAPE}$`);

const COMPACT_STANDARD = new RegExp(`^(${[...STANDARD_BODIES].join('|')})(${DESIGNATOR_SHAPE})$`);

function read(query: string): Token[] {
  return normalize(query).tokens.map((token) => {
    const fix = correct(token.text);

    return fix === null
      ? { text: token.text, original: token.text, start: token.start, end: token.end }
      : {
          text: fix.word,
          original: token.text,
          start: token.start,
          end: token.end,
          correction: fix.strength,
        };
  });
}

function quote(draft: Draft, from: number, to: number): string {
  const first = draft.tokens[from];
  const last = draft.tokens[to - 1];

  return first && last ? draft.query.slice(first.start, last.end) : '';
}

function claim(draft: Draft, from: number, to: number): void {
  for (let index = from; index < to; index++) draft.claimed.add(index);
}

function free(draft: Draft, from: number, to: number): boolean {
  for (let index = from; index < to; index++) {
    if (draft.claimed.has(index)) return false;
  }

  return true;
}

function settled(draft: Draft, from: number, to: number): boolean {
  for (let index = from; index < to; index++) {
    if (!draft.claimed.has(index)) return false;
  }

  return true;
}

/** A term reached through a correction is worth less than the same term spelled right,
 * so the discount multiplies the strength the lexicon gives. */
function discount(draft: Draft, from: number, to: number): number {
  let factor = 1;

  for (let index = from; index < to; index++) {
    factor = Math.min(factor, draft.tokens[index]?.correction ?? 1);
  }

  return factor;
}

function weigh(
  values: readonly Weighted<LexiconValue>[],
  factor: number,
): Weighted<LexiconValue>[] {
  return values.map((entry) => ({ ...entry, strength: entry.strength * factor }));
}

interface LexiconAttributes {
  type?: Weighted<ProductType>[];
  material?: Weighted<Material | MaterialFamily>;
  finish?: Weighted<Finish | FinishFamily>;
  standard?: string;
}

/** First match per attribute wins; a second reading of an attribute already stated is
 * left unclaimed and becomes residue. */
function takeAttributes(draft: Draft): LexiconAttributes {
  const found: LexiconAttributes = { standard: takeStandardCode(draft) };

  for (const match of longestMatch(
    draft.tokens.map((token) => token.text),
    draft.claimed,
  )) {
    // A phrase naming a product the catalog does not carry. It is claimed rather than
    // left to the residue, which docs/DESIGN.md 5.3 forbids from emptying C.
    if (match.attribute === 'unknownType') {
      if (draft.provenance.type !== undefined) continue;

      draft.evidence.type = quote(draft, match.start, match.end);
      draft.provenance.type = 'unrecognized';
      claim(draft, match.start, match.end);
      continue;
    }

    const factor = discount(draft, match.start, match.end);
    const values = weigh(match.values, factor);
    const [first] = values;
    if (first === undefined) continue;

    // The lexicon keys its values by attribute; the type system carries the union, so
    // the branch that reads the attribute is where the value regains its type.
    if (match.attribute === 'type') {
      if (found.type !== undefined || draft.provenance.type === 'unrecognized') continue;
      found.type = values as Weighted<ProductType>[];
    } else if (match.attribute === 'material') {
      if (found.material !== undefined) continue;
      found.material = first as Weighted<Material | MaterialFamily>;
    } else if (match.attribute === 'finish') {
      if (found.finish !== undefined) continue;
      found.finish = first as Weighted<Finish | FinishFamily>;
    } else {
      if (found.standard !== undefined) continue;
      found.standard = String(first.value);
    }

    draft.evidence[match.attribute] = quote(draft, match.start, match.end);
    draft.provenance[match.attribute] = factor < 1 ? 'corrected' : 'explicit';
    claim(draft, match.start, match.end);
  }

  return found;
}

interface StandardCode {
  body: string;
  designator: string;
  to: number;
}

/** `DIN125` and `DIN 125` are one expression spelled two ways; whether the catalog stocks
 * the standard decides nothing here, so neither may depend on a space. */
function readStandardCode(draft: Draft, index: number): StandardCode | undefined {
  const token = draft.tokens[index];
  if (token === undefined) return undefined;

  const compact = COMPACT_STANDARD.exec(token.text);
  if (compact) {
    const [, body = '', designator = ''] = compact;

    return { body, designator, to: index + 1 };
  }

  const next = draft.tokens[index + 1];
  if (next === undefined) return undefined;
  if (!STANDARD_BODIES.has(token.text) || !DESIGNATOR.test(next.text)) return undefined;

  return { body: token.text, designator: next.text, to: index + 2 };
}

/** Syntactic, not a lookup, and read before the lexicon so `DIN 316` cannot be halved into
 * a material (docs/DESIGN.md 5.3, 10.5). The thread guard keeps `iso M8` a size. */
function takeStandardCode(draft: Draft): string | undefined {
  for (let index = 0; index < draft.tokens.length; index++) {
    const code = readStandardCode(draft, index);

    if (code === undefined) continue;
    if (!free(draft, index, code.to)) continue;
    if (classifySizeToken(code.designator)?.kind === 'thread') continue;

    draft.evidence.standard = quote(draft, index, code.to);
    draft.provenance.standard = 'explicit';
    claim(draft, index, code.to);

    return `${code.body.toUpperCase()} ${code.designator.toUpperCase()}`;
  }

  return undefined;
}

function takeIntent(draft: Draft): string[] {
  const candidates: string[] = [];

  for (let index = 0; index < draft.tokens.length; index++) {
    if (draft.claimed.has(index)) continue;

    for (
      let width = Math.min(MAX_INTENT_TOKENS, draft.tokens.length - index);
      width >= 1;
      width--
    ) {
      if (!free(draft, index, index + width)) continue;

      // What the user wrote, not what the corrector made of it: `same` sits one
      // transposition from `asme` and comes back as the standard.
      const phrase = draft.tokens
        .slice(index, index + width)
        .map((token) => token.original)
        .join(' ');

      if (!INTENT_PHRASES.includes(phrase)) continue;

      candidates.push(phrase);
      claim(draft, index, index + width);
      index += width - 1;
      break;
    }
  }

  return candidates;
}

/** A unit standing on its own annotates the size token before it; a token that already
 * has the shape of a thread keeps it, which is what makes `1/2 inch` a diameter and
 * `12 mm` a length. */
function sizeSlots(draft: Draft): SizeSlot[] {
  const slots: SizeSlot[] = [];

  for (let index = 0; index < draft.tokens.length; index++) {
    const token = draft.tokens[index];
    if (token === undefined || draft.claimed.has(index)) continue;

    if (token.text === SEPARATOR) {
      claim(draft, index, index + 1);
      continue;
    }

    const next = draft.tokens[index + 1];
    const unit = next !== undefined && !draft.claimed.has(index + 1) && UNIT_TOKENS.has(next.text);

    const bare = classifySizeToken(token.text);
    const united = unit && next ? classifySizeToken(`${token.text} ${next.text}`) : undefined;
    const size = bare?.kind === 'thread' ? bare : (united ?? bare);
    if (size === undefined) continue;

    const to = unit && (united !== undefined || bare?.kind === 'thread') ? index + 2 : index + 1;
    slots.push({ size, from: index, to });
    index = to - 1;
  }

  return slots;
}

/** A nominal keeps the pitch the catalog gives it when the query does not say one; a
 * stated pitch the catalog does not use leaves the diameter unknown, so the query reaches
 * the null hypothesis instead of matching the coarse thread. */
function readThread(draft: Draft, size: ThreadToken): Thread | undefined {
  const diameter = resolveDiameter(size.nominal);
  if (diameter === undefined) return undefined;

  const catalog = DIAMETERS.find((entry) => entry.nominal === size.nominal)?.pitch;

  if (size.pitch === undefined) {
    if (catalog !== undefined) draft.provenance.pitch = 'inferred';

    return { diameter, pitch: catalog };
  }

  draft.evidence.pitch = size.pitch;
  draft.provenance.pitch = 'explicit';

  // M6-1 and M6-1.0 name one pitch; the stored value is the catalog's spelling so that
  // everything downstream can compare pitches as equals rather than as text.
  const stated = catalog !== undefined && Number(size.pitch) === Number(catalog);

  return {
    diameter: { ...diameter, known: diameter.known && stated },
    pitch: stated ? catalog : size.pitch,
  };
}

/** No thread anywhere in the query: a whole number of millimetres is the nominal itself,
 * which is what reads `12 millimeter hex nut` as M12. docs/BRIEF.md 6. */
function readMillimetres(draft: Draft, size: SizeToken): Thread | undefined {
  if (size.kind !== 'length' || size.unit !== 'mm' || !Number.isInteger(size.value)) {
    return undefined;
  }

  const diameter = resolveDiameter(`M${size.value}`);
  if (diameter === undefined) return undefined;

  const pitch = DIAMETERS.find((entry) => entry.nominal === diameter.nominal)?.pitch;
  if (pitch !== undefined) draft.provenance.pitch = 'inferred';

  return { diameter, pitch };
}

/** The mirror of `readMillimetres` on the imperial side: with no thread anywhere, a
 * fraction the user closed with the inch mark is the nominal, not a length. */
function readInches(draft: Draft, size: SizeToken): Thread | undefined {
  if (size.kind !== 'length' || size.unit !== 'in') return undefined;

  const mm = toMm(size.value, 'in');
  const entry = DIAMETERS.find(
    (candidate) => candidate.system === 'imperial' && candidate.mm === mm,
  );
  if (entry === undefined) return undefined;

  const diameter = resolveDiameter(entry.nominal);
  if (diameter === undefined) return undefined;

  draft.provenance.pitch = 'inferred';

  return { diameter, pitch: entry.pitch };
}

/** After the diameter, every remaining size token is read as a length: `3/4-10 tap bolt
 * 5/8` and `#10-24 x 1/2` both put a thread-shaped token where the length belongs. */
function asLength(size: SizeToken): SizeToken | undefined {
  if (size.kind === 'length') return size;
  if (size.pitch !== undefined) return undefined;

  const value = parseNumber(size.nominal);

  return value === undefined ? undefined : { kind: 'length', value };
}

interface Thread {
  diameter: Diameter;
  pitch?: string;
}

interface Sizes {
  diameter?: Diameter;
  pitch?: string;
  length?: Length;
}

/** A dimension the query sets apart itself: it carries its own unit, or it stands where
 * the separator put it. Either says dimension without help from the words in between. */
function delimited(draft: Draft, slot: SizeSlot): boolean {
  if (slot.size.kind === 'length' && slot.size.unit !== undefined) return true;

  return draft.tokens[slot.from - 1]?.text === SEPARATOR;
}

function takeSizes(draft: Draft, slots: readonly SizeSlot[]): Sizes {
  const sizes: Sizes = {};
  const threadAt = slots.findIndex((slot) => slot.size.kind === 'thread');
  const headAt = threadAt >= 0 ? threadAt : 0;
  const head = slots[headAt];
  const size = head?.size;

  const thread =
    size === undefined
      ? undefined
      : size.kind === 'thread'
        ? readThread(draft, size)
        : (readMillimetres(draft, size) ?? readInches(draft, size));

  if (head !== undefined && thread !== undefined) {
    sizes.diameter = thread.diameter;
    sizes.pitch = thread.pitch;
    draft.evidence.diameter = quote(draft, head.from, head.to);
    draft.provenance.diameter = size?.kind === 'thread' ? 'explicit' : 'inferred';
    claim(draft, head.from, head.to);
  }

  const reach = sizes.diameter === undefined ? undefined : head?.to;

  // A number the diameter reaches only over unclaimed ground belongs to something else,
  // as the 8 of `1/2-13 hex nut grade 8`; one the query delimits is a dimension regardless.
  for (const slot of thread === undefined ? slots : slots.slice(headAt + 1)) {
    if (reach !== undefined && !delimited(draft, slot) && !settled(draft, reach, slot.from)) {
      continue;
    }
    const candidate = asLength(slot.size);
    const resolved = candidate && resolveLength(candidate, sizes.diameter);
    if (!resolved) continue;

    sizes.length = resolved.length;
    draft.evidence.length = quote(draft, slot.from, slot.to);
    draft.provenance.length = resolved.provenance;
    claim(draft, slot.from, slot.to);
    break;
  }

  return sizes;
}

export function parseQuery(query: string): QueryParse {
  const draft: Draft = {
    query,
    tokens: read(query),
    claimed: new Set<number>(),
    evidence: {},
    provenance: {},
  };

  const attributes = takeAttributes(draft);
  const intentCandidates = takeIntent(draft);
  const sizes = takeSizes(draft, sizeSlots(draft));

  const residue = draft.tokens
    .filter((_token, index) => !draft.claimed.has(index))
    .map((token) => token.original);

  return {
    spec: {
      ...sizes,
      ...attributes,
      residue,
      evidence: draft.evidence,
      provenance: draft.provenance,
    },
    intentCandidates,
  };
}

export const queryParser: QueryParser = { parse: (query) => parseQuery(query).spec };
