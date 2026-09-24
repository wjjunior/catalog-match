import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
  Standard,
} from '../domain/attributes';
import type { DescriptionParser } from '../domain/contracts';
import type { AttributeName, ParsedSpec, Provenance, Weighted } from '../domain/spec';
import type { LexiconAttribute, LexiconMatch, LexiconValue } from './lexicon';
import { longestMatch } from './lexicon';
import type { NormalizedToken } from './normalize';
import { normalize } from './normalize';
import { classifySizeToken, resolveDiameter, resolveLength } from './units';

export class DescriptionParseError extends Error {
  constructor(
    readonly description: string,
    readonly attribute: AttributeName,
  ) {
    super(`cannot read the ${attribute} of the catalog row "${description}"`);
    this.name = 'DescriptionParseError';
  }
}

/** `LexiconEntry` erases which member of the union an attribute carries; each list is
 * built from its own attribute's type, so narrowing it back is sound. */
function valuesOf<T extends LexiconValue>(match: LexiconMatch): Weighted<T>[] {
  return [...match.values] as Weighted<T>[];
}

function firstValue<T extends LexiconValue>(
  match: LexiconMatch,
  description: string,
  attribute: AttributeName,
): Weighted<T> {
  const [first] = valuesOf<T>(match);
  if (first === undefined) throw new DescriptionParseError(description, attribute);
  return first;
}

function quote(
  description: string,
  tokens: readonly NormalizedToken[],
  match: LexiconMatch,
): string {
  const first = tokens[match.start];
  const last = tokens[match.end - 1];
  return first && last ? description.slice(first.start, last.end) : '';
}

function spanned(match: LexiconMatch): number[] {
  return Array.from({ length: match.end - match.start }, (_value, offset) => match.start + offset);
}

/** The one grammar every catalog row follows, docs/DESIGN.md 3.1:
 * `<diameter>[-<pitch>] [X <length><unit>] <type phrase> [<standard>] <material> <finish>`.
 * Its size section is positional, never searched, so a material code like 316 is never a length. */
export function parseDescription(description: string): ParsedSpec {
  const { tokens } = normalize(description);

  const head = tokens[0];
  const size = head === undefined ? undefined : classifySizeToken(head.text);
  if (head === undefined || size?.kind !== 'thread') {
    throw new DescriptionParseError(description, 'diameter');
  }

  const diameter = resolveDiameter(size.nominal);
  if (diameter === undefined) throw new DescriptionParseError(description, 'diameter');

  const separated = tokens[1]?.text === 'x';
  const lengthToken = separated ? tokens[2] : undefined;
  const classified = lengthToken === undefined ? undefined : classifySizeToken(lengthToken.text);
  const length = classified === undefined ? undefined : resolveLength(classified, diameter);
  if (separated && length === undefined) throw new DescriptionParseError(description, 'length');

  const rest = tokens.slice(separated ? 3 : 1);
  const matches = longestMatch(rest.map((token) => token.text));
  const find = (attribute: LexiconAttribute): LexiconMatch | undefined =>
    matches.find((match) => match.attribute === attribute);

  const typeMatch = find('type');
  if (typeMatch === undefined) throw new DescriptionParseError(description, 'type');

  const materialMatch = find('material');
  if (materialMatch === undefined) throw new DescriptionParseError(description, 'material');

  const finishMatch = find('finish');
  if (finishMatch === undefined) throw new DescriptionParseError(description, 'finish');

  const standardMatch = find('standard');

  const evidence: Partial<Record<AttributeName, string>> = {
    diameter: description.slice(head.start, head.end),
    type: quote(description, rest, typeMatch),
    material: quote(description, rest, materialMatch),
    finish: quote(description, rest, finishMatch),
  };
  const provenance: Partial<Record<AttributeName, Provenance>> = {
    diameter: 'explicit',
    type: 'explicit',
    material: 'explicit',
    finish: 'explicit',
  };

  if (lengthToken && length) {
    evidence.length = description.slice(lengthToken.start, lengthToken.end);
    provenance.length = length.provenance;
  }
  if (standardMatch) {
    evidence.standard = quote(description, rest, standardMatch);
    provenance.standard = 'explicit';
  }

  const covered = new Set(matches.flatMap(spanned));

  return {
    diameter,
    pitch: size.pitch,
    length: length?.length,
    type: valuesOf<ProductType>(typeMatch),
    material: firstValue<Material | MaterialFamily>(materialMatch, description, 'material'),
    finish: firstValue<Finish | FinishFamily>(finishMatch, description, 'finish'),
    standard: standardMatch && firstValue<Standard>(standardMatch, description, 'standard').value,
    residue: rest.filter((_token, index) => !covered.has(index)).map((token) => token.text),
    evidence,
    provenance,
  };
}

export const descriptionParser: DescriptionParser = { parse: parseDescription };
