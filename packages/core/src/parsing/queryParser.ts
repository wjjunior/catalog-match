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
  LengthUnit,
  ParsedSpec,
  Provenance,
  Weighted,
} from '../domain/spec';
import { INTENT_PHRASES } from '../personalization/intent';
import { correct } from './fuzzy';
import { STANDARD_BODIES, longestMatch, type LexiconMatch, type LexiconValue } from './lexicon';
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
  intentCandidates: string[];
}

type ThreadToken = Extract<SizeToken, { kind: 'thread' }>;

interface Token {
  text: string;
  original: string;
  start: number;
  end: number;
  correction?: number;
}

interface SizeSlot {
  size: SizeToken;
  from: number;
  to: number;
  unit?: LengthUnit;
}

interface Draft {
  query: string;
  tokens: Token[];
  claimed: Set<number>;
  evidence: Partial<Record<AttributeName, string>>;
  provenance: Partial<Record<AttributeName, Provenance>>;
}

const SEPARATOR = 'x';

const UNIT_TOKENS: ReadonlySet<string> = new Set(['in', 'ft', 'mm', '"']);

const MAX_INTENT_TOKENS = Math.max(...INTENT_PHRASES.map((phrase) => phrase.split(' ').length));

const DESIGNATOR_SHAPE = String.raw`[a-z]?\d+(?:\.\d+)*[a-z]?`;

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

function claimUnknownType(draft: Draft, match: LexiconMatch): boolean {
  if (match.attribute !== 'unknownType') return false;
  if (draft.provenance.type !== undefined) return true;

  draft.evidence.type = quote(draft, match.start, match.end);
  draft.provenance.type = 'unrecognized';
  claim(draft, match.start, match.end);

  return true;
}

function storeAttribute(
  draft: Draft,
  found: LexiconAttributes,
  match: LexiconMatch,
  factor: number,
  first: Weighted<LexiconValue>,
  values: Weighted<LexiconValue>[],
): boolean {
  const attribute = match.attribute;
  if (attribute === 'unknownType') return false;

  if (attribute === 'type') {
    if (found.type !== undefined || draft.provenance.type === 'unrecognized') return false;
    found.type = values as Weighted<ProductType>[];
  } else if (attribute === 'material') {
    if (found.material !== undefined) return false;
    found.material = first as Weighted<Material | MaterialFamily>;
  } else if (attribute === 'finish') {
    if (found.finish !== undefined) return false;
    found.finish = first as Weighted<Finish | FinishFamily>;
  } else {
    if (found.standard !== undefined) return false;
    found.standard = String(first.value);
  }

  draft.evidence[attribute] = quote(draft, match.start, match.end);
  draft.provenance[attribute] = factor < 1 ? 'corrected' : 'explicit';
  claim(draft, match.start, match.end);

  return true;
}

function takeAttributes(draft: Draft): LexiconAttributes {
  const found: LexiconAttributes = { standard: takeStandardCode(draft) };

  for (const match of longestMatch(
    draft.tokens.map((token) => token.text),
    draft.claimed,
  )) {
    if (claimUnknownType(draft, match)) continue;

    const factor = discount(draft, match.start, match.end);
    const values = weigh(match.values, factor);
    const [first] = values;
    if (first === undefined) continue;

    storeAttribute(draft, found, match, factor, first, values);
  }

  return found;
}

interface StandardCode {
  body: string;
  designator: string;
  to: number;
}

function readStandardCode(draft: Draft, index: number): StandardCode | undefined {
  const token = draft.tokens[index];
  if (token === undefined) return undefined;

  const compact = COMPACT_STANDARD.exec(token.original);
  if (compact) {
    const [, body = '', designator = ''] = compact;

    return { body, designator, to: index + 1 };
  }

  const next = draft.tokens[index + 1];
  if (next === undefined) return undefined;
  if (!STANDARD_BODIES.has(token.original) || !DESIGNATOR.test(next.original)) return undefined;

  return { body: token.original, designator: next.original, to: index + 2 };
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
  let index = 0;

  while (index < draft.tokens.length) {
    if (draft.claimed.has(index)) {
      index += 1;
      continue;
    }

    let matched = false;

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
      index += width;
      matched = true;
      break;
    }

    if (!matched) index += 1;
  }

  return candidates;
}

function statedUnit(size: SizeToken, united: SizeToken | undefined): LengthUnit | undefined {
  if (size.kind === 'length') return size.unit;

  return united?.kind === 'length' ? united.unit : undefined;
}

function sizeSlotAt(draft: Draft, index: number): SizeSlot | undefined {
  const token = draft.tokens[index];
  if (token === undefined) return undefined;

  const next = draft.tokens[index + 1];
  const unit = next !== undefined && !draft.claimed.has(index + 1) && UNIT_TOKENS.has(next.text);

  const bare = classifySizeToken(token.text);
  const united = unit && next ? classifySizeToken(`${token.text} ${next.text}`) : undefined;
  const size = bare?.kind === 'thread' ? bare : (united ?? bare);
  if (size === undefined) return undefined;

  const to = unit && (united !== undefined || bare?.kind === 'thread') ? index + 2 : index + 1;

  return { size, from: index, to, unit: statedUnit(size, united) };
}

function sizeSlots(draft: Draft): SizeSlot[] {
  const slots: SizeSlot[] = [];
  let index = 0;

  while (index < draft.tokens.length) {
    const token = draft.tokens[index];
    if (token === undefined || draft.claimed.has(index)) {
      index += 1;
      continue;
    }

    if (token.text === SEPARATOR) {
      claim(draft, index, index + 1);
      index += 1;
      continue;
    }

    const slot = sizeSlotAt(draft, index);
    if (slot === undefined) {
      index += 1;
      continue;
    }

    slots.push(slot);
    index = slot.to;
  }

  return slots;
}

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

  const stated = catalog !== undefined && Number(size.pitch) === Number(catalog);

  return {
    diameter: { ...diameter, known: diameter.known && stated },
    pitch: stated ? catalog : size.pitch,
  };
}

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

function asLength(slot: SizeSlot): SizeToken | undefined {
  const { size } = slot;
  if (size.kind === 'length') return size;
  if (size.pitch !== undefined) return undefined;

  const value = parseNumber(size.nominal);

  return value === undefined ? undefined : { kind: 'length', value, unit: slot.unit };
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

function delimited(draft: Draft, slot: SizeSlot): boolean {
  if (slot.unit !== undefined) return true;

  return draft.tokens[slot.from - 1]?.text === SEPARATOR;
}

function headThread(draft: Draft, size: SizeToken | undefined): Thread | undefined {
  if (size === undefined) return undefined;
  if (size.kind === 'thread') return readThread(draft, size);

  return readMillimetres(draft, size) ?? readInches(draft, size);
}

function claimDiameter(
  draft: Draft,
  sizes: Sizes,
  head: SizeSlot,
  thread: Thread,
  size: SizeToken | undefined,
): void {
  sizes.diameter = thread.diameter;
  sizes.pitch = thread.pitch;
  draft.evidence.diameter = quote(draft, head.from, head.to);
  draft.provenance.diameter = size?.kind === 'thread' ? 'explicit' : 'inferred';
  claim(draft, head.from, head.to);
}

function claimFirstLength(
  draft: Draft,
  sizes: Sizes,
  slots: readonly SizeSlot[],
  reach: number | undefined,
): void {
  for (const slot of slots) {
    if (reach !== undefined && !delimited(draft, slot) && !settled(draft, reach, slot.from)) {
      continue;
    }

    const candidate = asLength(slot);
    const resolved = candidate && resolveLength(candidate, sizes.diameter);
    if (!resolved) continue;

    sizes.length = resolved.length;
    draft.evidence.length = quote(draft, slot.from, slot.to);
    draft.provenance.length = resolved.provenance;
    claim(draft, slot.from, slot.to);
    break;
  }
}

function takeSizes(draft: Draft, slots: readonly SizeSlot[]): Sizes {
  const sizes: Sizes = {};
  const threadAt = slots.findIndex((slot) => slot.size.kind === 'thread');
  const headAt = Math.max(threadAt, 0);
  const head = slots[headAt];
  const size = head?.size;
  const thread = headThread(draft, size);

  if (head !== undefined && thread !== undefined) {
    claimDiameter(draft, sizes, head, thread, size);
  }

  const reach = sizes.diameter === undefined ? undefined : head?.to;
  const remaining = thread === undefined ? slots : slots.slice(headAt + 1);
  claimFirstLength(draft, sizes, remaining, reach);

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

  // Intent first, so a phrase the user wrote is claimed before the corrected spelling of it
  // can be read as anything else; the standard scan then still precedes the lexicon.
  const intentCandidates = takeIntent(draft);
  const attributes = takeAttributes(draft);
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
