import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { QueryParser } from '../domain/contracts';
import type { Length, ParsedSpec } from '../domain/spec';
import { INTENT_PHRASES } from '../personalization/intent';
import { ADVERSARIAL_QUERIES } from '../../test/fixtures/adversarial-queries';
import {
  EXAMPLE_QUERIES,
  type QueryFixture,
  type SpecValues,
} from '../../test/fixtures/example-queries';
import { correct, VOCABULARY } from './fuzzy';
import { LEXICON, STANDARD_BODIES } from './lexicon';
import { normalize } from './normalize';
import { unitMismatch } from './units';
import { parseQuery, queryParser } from './queryParser';

function values(spec: ParsedSpec): SpecValues {
  return {
    diameter: spec.diameter,
    pitch: spec.pitch,
    length: spec.length,
    type: spec.type,
    material: spec.material,
    finish: spec.finish,
    standard: spec.standard,
    residue: spec.residue,
  };
}

const parse = (query: string): ParsedSpec => parseQuery(query).spec;

function itParses(fixtures: readonly QueryFixture[]): void {
  it.each(fixtures)('parses $query', (fixture) => {
    const { spec, intentCandidates } = parseQuery(fixture.query);

    expect(values(spec)).toEqual(fixture.spec);
    expect(intentCandidates).toEqual(fixture.intentCandidates ?? []);
  });
}

describe('the example queries', () => {
  itParses(EXAMPLE_QUERIES);

  it('covers the 33 of the document', () => {
    expect(EXAMPLE_QUERIES).toHaveLength(33);
  });
});

describe('the adversarial queries', () => {
  itParses(ADVERSARIAL_QUERIES);

  it('keeps a metric diameter with an inch length as stated, so the mismatch survives', () => {
    const spec = parse('M8 x 3/4 hex cap screw');

    expect(spec.diameter && spec.length && unitMismatch(spec.diameter, spec.length)).toBe(true);
  });

  it('reads no mismatch when the systems agree', () => {
    const spec = parse('M8 x 16 hex cap screw');

    expect(spec.diameter && spec.length && unitMismatch(spec.diameter, spec.length)).toBe(false);
  });
});

describe('an intent phrase', () => {
  it('survives the punctuation the user glued to it', () => {
    const { spec, intentCandidates } = parseQuery('same washers as last time, but brass');

    expect(intentCandidates).toEqual(['same', 'last time']);
    expect(spec.residue).toEqual(['as', 'but']);
  });

  it('survives the punctuation that ends a sentence', () => {
    const { spec, intentCandidates } = parseQuery('reorder.');

    expect(intentCandidates).toEqual(['reorder']);
    expect(spec.residue).toEqual([]);
  });
});

describe('punctuation glued to a word', () => {
  it('reads the type phrase a comma interrupts', () => {
    const spec = parse('M8 hex nut, zinc');

    expect(spec.type).toEqual([{ value: 'hex_nut', strength: 1 }]);
    expect(spec.finish).toEqual({ value: 'zinc', strength: 1 });
    expect(spec.diameter?.nominal).toBe('M8');
    expect(spec.residue).toEqual([]);
  });

  it('reads the length a comma follows', () => {
    const spec = parse('hex bolt, 1/2-13 x 2", zinc');

    expect(spec.length).toEqual({ value: 2, unit: 'in', mm: 50.8 });
    expect(spec.residue).toEqual([]);
  });

  it('reads the standard a comma follows', () => {
    const spec = parse('hex cap screw ASME B18.2.1, zinc');

    expect(spec.standard).toBe('ASME B18.2.1');
    expect(spec.residue).toEqual([]);
  });

  // The span stops at the word, so evidence quotes the term and not the sentence.
  it('quotes the term without the punctuation behind it', () => {
    const { spec } = parseQuery('M8 hex nut, zinc');

    expect(spec.evidence.type).toBe('hex nut');
  });
});

describe('abbreviation parity', () => {
  it('reads an abbreviated query and its expansion into the same values', () => {
    const abbreviated = parse('SHCS 7/16 x 2-1/2');
    const expanded = parse('7/16-14 x 2-1/2 socket head cap screw');

    expect(values(abbreviated)).toEqual(values(expanded));
  });

  it('separates them by provenance alone', () => {
    expect(parse('SHCS 7/16 x 2-1/2').provenance.pitch).toBe('inferred');
    expect(parse('7/16-14 x 2-1/2 socket head cap screw').provenance.pitch).toBe('explicit');
  });
});

describe('provenance', () => {
  it('marks a written nominal explicit and quotes it as the user wrote it', () => {
    const spec = parse('M8 flat washer');

    expect(spec.provenance).toEqual({ diameter: 'explicit', pitch: 'inferred', type: 'explicit' });
    expect(spec.evidence).toEqual({ diameter: 'M8', type: 'flat washer' });
  });

  it('marks a diameter read out of a millimetre figure inferred', () => {
    const spec = parse('12 millimeter hex nut');

    expect(spec.provenance.diameter).toBe('inferred');
    expect(spec.evidence.diameter).toBe('12 millimeter');
  });

  it('marks a nominal stated with an inch unit explicit', () => {
    const spec = parse('1/2 inch hex nut');

    expect(spec.provenance.diameter).toBe('explicit');
    expect(spec.evidence.diameter).toBe('1/2 inch');
  });

  it('marks a corrected term corrected and keeps the original spelling', () => {
    const spec = parse('hex nutt');

    expect(spec.provenance.type).toBe('corrected');
    expect(spec.evidence.type).toBe('hex nutt');
  });

  it('marks a stated unit explicit and an inferred one inferred', () => {
    expect(parse('M16 threaded rod 60mm').provenance.length).toBe('explicit');
    expect(parse('M8 x 16 hex cap screw').provenance.length).toBe('inferred');
  });

  it('quotes the user in the residue, not the corrector', () => {
    // `plate` is one edit from `plated`, which the lexicon knows only inside `zinc
    // plated`: the correction leads nowhere and the word must arrive as it was written.
    expect(parse('M8 hex nut plate').residue).toEqual(['plate']);
  });

  it('never marks anything approximate, which belongs to the alternative search', () => {
    const provenances = [...EXAMPLE_QUERIES, ...ADVERSARIAL_QUERIES].flatMap((fixture) =>
      Object.values(parse(fixture.query).provenance),
    );

    expect(provenances).not.toContain('approximate');
  });
});

describe('a diameter outside the catalog', () => {
  it('parses an unknown nominal rather than dropping it', () => {
    expect(parse('M14 hex nut').diameter).toEqual({
      system: 'metric',
      nominal: 'M14',
      mm: 14,
      known: false,
    });
  });

  it('marks a catalog nominal with a foreign pitch unknown', () => {
    const spec = parse('1/2-20 hex nut');

    expect(spec.diameter?.known).toBe(false);
    expect(spec.pitch).toBe('20');
  });

  it('keeps a catalog nominal with its own pitch known', () => {
    expect(parse('1/2-13 hex nut').diameter?.known).toBe(true);
  });
});

describe('a standard the catalog does not stock', () => {
  it.each(['M8 x 50mm BHCS DIN 125', 'M8 flat washer DIN 125', 'DIN 125 M8 flat washer'])(
    'reads the standard of %s instead of leaving it to residue',
    (query) => {
      const spec = parse(query);

      expect(spec.standard).toBe('DIN 125');
      expect(spec.evidence.standard).toBe('DIN 125');
      expect(spec.provenance.standard).toBe('explicit');
      expect(spec.residue).toEqual([]);
    },
  );

  it('never binds the designator as a length, whichever side of the diameter it sits', () => {
    expect(parse('M8 flat washer DIN 125').length).toBeUndefined();
    expect(values(parse('M8 flat washer DIN 125'))).toEqual(
      values(parse('DIN 125 M8 flat washer')),
    );
  });

  it.each([
    ['ANSI B18.6.3 M8 hex nut', 'ANSI B18.6.3'],
    ['M8 hex nut ASTM F593', 'ASTM F593'],
    ['ISO 4762 M8 socket head cap screw', 'ISO 4762'],
  ])('reads %s as %s', (query, standard) => {
    expect(parse(query).standard).toBe(standard);
  });

  it('still reads the standards the catalog does stock', () => {
    expect(parse('M8 x 50mm BHCS ISO 7380').standard).toBe('ISO 7380');
    expect(parse('5/16-18 flat washer ASME B18.2.1').standard).toBe('ASME B18.2.1');
    expect(parse('1/2-13 hex bolt class 8').standard).toBe('CLASS 8');
  });

  it('takes no standard from a number without a standards body in front of it', () => {
    expect(parse('grade 8 1/2-13 hex nut').standard).toBeUndefined();
    expect(parse('1/2-13 hex nut grade 8').standard).toBeUndefined();
  });

  it('leaves the diameter alone when a body word stands in front of it', () => {
    const spec = parse('iso M8 hex nut');

    expect(spec.standard).toBeUndefined();
    expect(spec.diameter?.nominal).toBe('M8');
  });

  it('leaves a lone body word in the residue', () => {
    expect(parse('M8 hex nut din').standard).toBeUndefined();
    expect(parse('M8 hex nut din').residue).toEqual(['din']);
  });
});

describe('an unclaimed word between the diameter and a number', () => {
  it.each(['grade 8 1/2-13 hex nut', '1/2-13 hex nut grade 8'])(
    'leaves the 8 of %s out of the length',
    (query) => {
      const spec = parse(query);

      expect(spec.length).toBeUndefined();
      expect(spec.evidence.length).toBeUndefined();
      expect(spec.residue).toEqual(['grade', '8']);
      expect(spec.diameter?.nominal).toBe('1/2');
    },
  );

  it('parses both word orders to the same spec', () => {
    expect(values(parse('grade 8 1/2-13 hex nut'))).toEqual(
      values(parse('1/2-13 hex nut grade 8')),
    );
  });

  it('still reads a length the type phrase alone separates from the diameter', () => {
    expect(parse('M16 threaded rod 60mm').length).toEqual({ value: 60, unit: 'mm', mm: 60 });
    expect(parse('3/8 lag screw 1 inch').length).toEqual({ value: 1, unit: 'in', mm: 25.4 });
  });
});

describe('a quantity phrase standing beside a length', () => {
  it.each(['M8 x 50 qty 100 BHCS', 'M8 x 50 BHCS qty 100'])(
    'reads the 50 of %s as the length and the 100 as the quantity',
    (query) => {
      const spec = parse(query);

      expect(spec.length).toEqual({ value: 50, unit: 'mm', mm: 50 });
      expect(spec.evidence.length).toBe('50');
      expect(spec.residue).toEqual([]);
    },
  );

  it('parses both word orders to the same spec', () => {
    expect(values(parse('M8 x 50 qty 100 BHCS'))).toEqual(values(parse('M8 x 50 BHCS qty 100')));
  });
});

describe('a pitch the user spelled with different zeros', () => {
  it.each([
    ['M6-1 x 50mm tap bolt', 'M6', '1.0'],
    ['M16-2 x 50mm hex bolt', 'M16', '2.0'],
    ['M8-1.250 x 50mm hex bolt', 'M8', '1.25'],
  ])('reads %s as the catalog pitch, keeping the diameter known', (query, nominal, pitch) => {
    const spec = parse(query);

    expect(spec.diameter?.nominal).toBe(nominal);
    expect(spec.diameter?.known).toBe(true);
    expect(spec.pitch).toBe(pitch);
    expect(spec.provenance.pitch).toBe('explicit');
  });

  it('quotes what the user typed even where the stored pitch is the catalog spelling', () => {
    expect(parse('M6-1 x 50mm tap bolt').evidence.pitch).toBe('1');
  });

  it('parses M6-1 and M6-1.0 to the same stored pitch', () => {
    expect(parse('M6-1 x 50mm tap bolt').pitch).toBe(parse('M6-1.0 x 50mm tap bolt').pitch);
  });

  it('still rejects a pitch that is a different number', () => {
    const spec = parse('1/2-20 hex nut');

    expect(spec.diameter?.known).toBe(false);
    expect(spec.pitch).toBe('20');
  });
});

describe('a fraction the user closed with the inch mark', () => {
  it('reads it as the imperial nominal when no other thread token stands in the query', () => {
    const spec = parse('1/2"');

    expect(spec.diameter).toEqual({ system: 'imperial', nominal: '1/2', mm: 12.7, known: true });
    expect(spec.pitch).toBe('13');
    expect(spec.length).toBeUndefined();
  });

  it('marks it inferred, as it does the millimetre figure it mirrors', () => {
    expect(parse('1/2"').provenance.diameter).toBe('inferred');
  });

  it('reads the same query with and without the mark', () => {
    expect(parse('1/2" hex nut').diameter).toEqual(parse('1/2 hex nut').diameter);
  });

  it('leaves the token after the separator a length', () => {
    const spec = parse('1/2" x 3"');

    expect(spec.diameter?.nominal).toBe('1/2');
    expect(spec.length).toEqual({ value: 3, unit: 'in', mm: 76.2 });
  });

  it('leaves a query that already states a thread alone', () => {
    const spec = parse('SHCS 7/16 x 2-1/2"');

    expect(spec.diameter?.nominal).toBe('7/16');
    expect(spec.length).toEqual({ value: 2.5, unit: 'in', mm: 63.5 });
  });

  it('leaves an inch figure the catalog has no diameter for a length', () => {
    const spec = parse('7/8"');

    expect(spec.diameter).toBeUndefined();
    expect(spec.length).toEqual({ value: 0.875, unit: 'in', mm: 22.225 });
  });
});

describe('a type phrase outside the catalog', () => {
  it('marks the phrase unrecognized and quotes it', () => {
    const spec = parse('carriage bolt 3/8');

    expect(spec.provenance.type).toBe('unrecognized');
    expect(spec.evidence.type).toBe('carriage bolt');
    expect(spec.type).toBeUndefined();
  });

  it('claims the phrase, so it does not also arrive as residue', () => {
    expect(parse('carriage bolt 3/8').residue).toEqual([]);
  });

  it('reads the rest of the query as it would otherwise', () => {
    const spec = parse('carriage bolt 3/8');

    expect(spec.diameter).toEqual({
      system: 'imperial',
      nominal: '3/8',
      mm: 9.525,
      known: true,
    });
    expect(spec.pitch).toBe('16');
  });

  it.each([
    'eye bolt 1/2',
    'u bolt 3/8',
    'j bolt',
    'shoulder bolt M8',
    'square head bolt 3/8',
    'wing nut M8',
    'acorn nut 1/2',
    'nylon lock nut M8',
  ])('marks %s unrecognized as well', (query) => {
    const spec = parse(query);

    expect(spec.provenance.type).toBe('unrecognized');
    expect(spec.type).toBeUndefined();
  });

  // docs/DESIGN.md 6 keeps this one ambiguous: `big` sizes a bolt, it does not name a
  // different product, and nothing before `bolt` is left unclaimed to suggest otherwise.
  it('leaves big brass bolt the three readings of bolt', () => {
    const spec = parse('big brass bolt');

    expect(spec.provenance.type).toBe('explicit');
    expect(spec.type).toHaveLength(3);
    expect(spec.residue).toEqual(['big']);
  });

  // The rule the whole scan follows: whichever reading of an attribute comes first wins,
  // and the loser is left unclaimed.
  it.each([
    ['hex nut carriage bolt', 'explicit', ['carriage', 'bolt']],
    ['carriage bolt hex nut', 'unrecognized', ['hex', 'nut']],
  ])('lets the first reading of the type in %s win', (query, provenance, residue) => {
    const spec = parse(query);

    expect(spec.provenance.type).toBe(provenance);
    expect(spec.residue).toEqual(residue);
  });

  it('leaves a modifier on a stocked type in the residue', () => {
    const spec = parse('M8 hex nut nylon insert');

    expect(spec.provenance.type).toBe('explicit');
    expect(spec.type).toEqual([{ value: 'hex_nut', strength: 1 }]);
    expect(spec.residue).toEqual(['nylon', 'insert']);
  });
});

describe('the parser as a contract', () => {
  it('satisfies QueryParser with the spec of the rich parse', () => {
    const contract: QueryParser = queryParser;

    expect(contract.parse('M8 flat washer')).toEqual(parse('M8 flat washer'));
  });

  it('returns the same result for the same query', () => {
    expect(parseQuery('please quote 200 pcs of M8 x 50 BHCS black oxide')).toEqual(
      parseQuery('please quote 200 pcs of M8 x 50 BHCS black oxide'),
    );
  });
});

describe('cost', () => {
  const RUNS = 50;
  const P95 = 0.95;
  const BUDGET_MS = 1;

  it('parses the example set at p95 under a millisecond', () => {
    const queries = EXAMPLE_QUERIES.map((fixture) => fixture.query);
    for (const query of queries) parseQuery(query);

    const durations: number[] = [];
    for (let run = 0; run < RUNS; run++) {
      for (const query of queries) {
        const start = performance.now();
        parseQuery(query);
        durations.push(performance.now() - start);
      }
    }

    durations.sort((a, b) => a - b);

    expect(durations[Math.floor(durations.length * P95)] ?? Infinity).toBeLessThan(BUDGET_MS);
  });
});

const GAP_WORDS = ['length', 'red', 'approx', 'zorbulon'] as const;

const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];

/** The family is "a word the parser recognises nothing in", so membership is a
 * precondition on the generator, never the expectation of a test. */
const unrecognized = (word: string): boolean =>
  !VOCABULARY.has(word) &&
  !STANDARD_BODIES.has(word) &&
  !INTENT_PHRASES.includes(word) &&
  correct(word) === null &&
  normalize(word).canonical === word;

const unrecognizedWord = fc
  .array(fc.constantFrom(...LETTERS), { minLength: 3, maxLength: 8 })
  .map((letters) => letters.join(''))
  .filter(unrecognized);

const fill = (template: string, word: string): string =>
  template.replace('{gap}', word).replace(/\s+/g, ' ').trim();

function apartFromResidue(spec: ParsedSpec): Record<string, unknown> {
  return {
    ...values(spec),
    residue: undefined,
    evidence: spec.evidence,
    provenance: spec.provenance,
  };
}

/** Every template states its dimension with a unit or behind the separator, so the
 * dimension is the query's whatever stands next to it. */
const GAP_TEMPLATES = [
  'M8 {gap} x 50mm BHCS',
  'M8 x 50mm {gap} BHCS',
  'M8 SHCS {gap} 30mm',
  'M8 {gap} SHCS 30mm',
  'M16 threaded rod {gap} 60mm',
  'M16 {gap} threaded rod 60mm',
  '3/8 lag screw {gap} 1 inch',
  '1/2-13 {gap} x 2" hex cap screw',
  'M8 {gap} x 50 BHCS',
  '1/2-13 {gap} x 2 hex cap screw',
];

describe('a word the parser does not recognise', () => {
  it.each(GAP_WORDS)('is unrecognized, which is what makes %s a member of the family', (word) => {
    expect(unrecognized(word)).toBe(true);
  });

  it.each(GAP_TEMPLATES)('changes nothing but the residue of %s', (template) => {
    const base = parse(fill(template, ''));

    for (const word of GAP_WORDS) {
      const widened = parse(fill(template, word));

      expect(apartFromResidue(widened)).toEqual(apartFromResidue(base));
      expect(widened.residue.filter((token) => token !== word)).toEqual(base.residue);
      expect(widened.residue).toContain(word);
    }
  });

  it('changes nothing but the residue for any such word', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GAP_TEMPLATES), unrecognizedWord, (template, word) => {
        const base = parse(fill(template, ''));
        const widened = parse(fill(template, word));

        expect(apartFromResidue(widened)).toEqual(apartFromResidue(base));
        expect(widened.residue.filter((token) => token !== word)).toEqual(base.residue);
      }),
    );
  });
});

/** The value comes from the literal the query states and from 25.4 mm to the inch, not
 * from asking the parser what it made of it. */
const DIMENSIONS: ReadonlyArray<readonly [string, Length]> = [
  ['30mm', { value: 30, unit: 'mm', mm: 30 }],
  ['50mm', { value: 50, unit: 'mm', mm: 50 }],
  ['12 mm', { value: 12, unit: 'mm', mm: 12 }],
  ['20 millimeters', { value: 20, unit: 'mm', mm: 20 }],
];

const INCH_DIMENSIONS: ReadonlyArray<readonly [string, Length]> = [
  ['2"', { value: 2, unit: 'in', mm: 50.8 }],
  ['1 inch', { value: 1, unit: 'in', mm: 25.4 }],
  ['1/2"', { value: 0.5, unit: 'in', mm: 12.7 }],
];

describe('a dimension the query delimits', () => {
  it.each(DIMENSIONS)('reads %s whatever unrecognized word precedes it', (literal, length) => {
    for (const word of GAP_WORDS) {
      expect(parse(`M8 ${word} ${literal} SHCS`).length).toEqual(length);
      expect(parse(`M8 SHCS ${word} ${literal}`).length).toEqual(length);
    }
  });

  it.each(INCH_DIMENSIONS)('reads %s whatever unrecognized word precedes it', (literal, length) => {
    for (const word of GAP_WORDS) {
      expect(parse(`1/2-13 ${word} ${literal} hex cap screw`).length).toEqual(length);
    }
  });

  // A unit the separator makes unnecessary: the system of the diameter supplies it.
  it.each(GAP_WORDS)('reads a bare number behind the separator across %s', (word) => {
    expect(parse(`M8 ${word} x 50 BHCS`).length).toEqual({ value: 50, unit: 'mm', mm: 50 });
    expect(parse(`1/2-13 ${word} x 2 hex cap screw`).length).toEqual({
      value: 2,
      unit: 'in',
      mm: 50.8,
    });
  });

  it('reads it behind any unrecognized word at all', () => {
    fc.assert(
      fc.property(unrecognizedWord, (word) => {
        expect(parse(`M8 ${word} x 50mm BHCS`).length).toEqual({ value: 50, unit: 'mm', mm: 50 });
        expect(parse(`M8 ${word} x 50 BHCS`).length).toEqual({ value: 50, unit: 'mm', mm: 50 });
      }),
    );
  });
});

const GRADE_PHRASES = ['grade 8', 'grade 5', 'class 10', 'lot 12', 'batch 3'];

/** Split where the query's own phrases end, so an insertion can be read as a word the
 * user added and not as one that cut a type phrase in half. */
const GRADE_BASES: ReadonlyArray<readonly [string, string]> = [
  ['1/2-13', 'hex nut'],
  ['M8', 'flat washer'],
  ['M8', 'SHCS'],
  ['M16', 'threaded rod'],
];

function insertions(base: string, phrase: string): string[] {
  const words = base.split(' ');

  return words
    .map((_word, index) => [...words.slice(0, index), phrase, ...words.slice(index)].join(' '))
    .concat(`${base} ${phrase}`);
}

function betweenPhrases([head, tail]: readonly [string, string], phrase: string): string[] {
  return [`${phrase} ${head} ${tail}`, `${head} ${phrase} ${tail}`, `${head} ${tail} ${phrase}`];
}

/** The guard the previous round put in for the 8 of `1/2-13 hex nut grade 8`. Nothing
 * delimits that number, in any word position, so it is never a dimension. */
describe('a bare number an unrecognized word carries', () => {
  it.each(GRADE_BASES)('never becomes the length of %s %s, in any word position', (...base) => {
    for (const phrase of GRADE_PHRASES) {
      for (const query of insertions(base.join(' '), phrase)) {
        const spec = parse(query);

        expect(spec.length).toBeUndefined();
        expect(spec.evidence.length).toBeUndefined();
      }
    }
  });

  it.each(GRADE_BASES)('reports the pair it could not verify in %s %s', (...base) => {
    for (const query of betweenPhrases(base as [string, string], 'grade 8')) {
      expect(parse(query).residue).toEqual(['grade', '8']);
    }
  });

  it('never becomes a length for any unrecognized word in front of it', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GRADE_BASES), unrecognizedWord, (base, word) => {
        for (const query of insertions(base.join(' '), `${word} 8`)) {
          expect(parse(query).length).toBeUndefined();
        }
      }),
    );
  });
});

const BODIES = [...STANDARD_BODIES];

/** Designators the catalog stocks, designators it does not, and designators that collide
 * with an attribute term the lexicon also reads. */
const DESIGNATORS = ['912', '933', '7380', '111', 'b18.2.1', 'a307', '125', '4762', '316', '304'];

describe('a standard spelled with and without the space', () => {
  it.each(BODIES)(
    'parses a compact %s standard exactly as it parses the spaced spelling',
    (body) => {
      for (const designator of DESIGNATORS) {
        const spaced = parse(`M8 flat washer ${body} ${designator}`);
        const compact = parse(`M8 flat washer ${body}${designator}`);

        expect(values(compact)).toEqual(values(spaced));
        expect(spaced.standard).toBe(`${body.toUpperCase()} ${designator.toUpperCase()}`);
        expect(compact.standard).toBe(spaced.standard);
      }
    },
  );

  it.each(BODIES)('quotes what the user wrote for %s either way', (body) => {
    expect(parse(`M8 flat washer ${body} 125`).evidence.standard).toBe(`${body} 125`);
    expect(parse(`M8 flat washer ${body}125`).evidence.standard).toBe(`${body}125`);
  });
});

/** A material term that is also a standard's designator: the standard is the whole
 * expression, so it is read before its halves can be read as attributes of their own. */
const COLLIDING = ['316', '304', 'a4', 'a2', 'a307', 'b18.2.1'];

describe('a standard whose designator is also an attribute term', () => {
  it.each(BODIES)('reads %s <term> as the standard and invents no material', (body) => {
    for (const designator of COLLIDING) {
      for (const query of [
        `M8 flat washer ${body} ${designator}`,
        `M8 flat washer ${body}${designator}`,
      ]) {
        const spec = parse(query);

        expect(spec.standard).toBe(`${body.toUpperCase()} ${designator.toUpperCase()}`);
        expect(spec.material).toBeUndefined();
        expect(spec.residue).toEqual([]);
      }
    }
  });

  it('still reads the term as a material where no standards body claims it', () => {
    expect(parse('M8 flat washer 316').material).toEqual({ value: 'ss_316', strength: 1 });
    expect(parse('M8 flat washer 304').material).toEqual({ value: 'ss_18_8', strength: 1 });
  });

  it('leaves the body word in the residue when nothing follows it', () => {
    expect(parse('M8 flat washer 316 din').standard).toBeUndefined();
    expect(parse('M8 flat washer 316 din').residue).toEqual(['din']);
  });
});

function swapped(word: string, index: number): string {
  return (
    word.slice(0, index) +
    word.slice(index + 1, index + 2) +
    word.slice(index, index + 1) +
    word.slice(index + 2)
  );
}

/** Every word one edit from this one, which is the reach the corrector is configured for:
 * the family comes from the closed set of bodies, not from asking the parser for it. */
function oneEditFrom(word: string): string[] {
  const edits = new Set<string>();

  for (let index = 0; index < word.length; index++) {
    edits.add(word.slice(0, index) + word.slice(index + 1));
    edits.add(swapped(word, index));

    for (const letter of LETTERS) {
      edits.add(word.slice(0, index) + letter + word.slice(index + 1));
      edits.add(word.slice(0, index) + letter + word.slice(index));
    }
  }

  for (const letter of LETTERS) edits.add(word + letter);

  return [...edits];
}

/** A word the corrector carries onto a standards body although the user wrote no body.
 * Membership is a precondition on the family, never the expectation of a test. */
const reachesBody = (word: string): boolean =>
  !STANDARD_BODIES.has(word) && STANDARD_BODIES.has(correct(word)?.word ?? '');

const BODY_LOOKALIKES = [...STANDARD_BODIES].flatMap(oneEditFrom).filter(reachesBody);

const LEXICON_STANDARDS = [...LEXICON.values()]
  .filter((entry) => entry.attribute === 'standard')
  .flatMap((entry) => entry.values.map((value) => String(value.value)));

/** Designators no lexicon term pairs with any body, so a standard read off one of them
 * could only have been minted by the scan. */
const UNPAIRED = DESIGNATORS.filter(
  (designator) =>
    !LEXICON_STANDARDS.some((standard) => standard.endsWith(` ${designator.toUpperCase()}`)),
);

describe('a token the corrector can carry onto a standards body', () => {
  it('is a family the vocabulary really holds, including the words this fix is about', () => {
    expect(BODY_LOOKALIKES).toContain('same');
    expect(BODY_LOOKALIKES).toContain('acme');
    expect(BODY_LOOKALIKES.length).toBeGreaterThan(50);
    expect(UNPAIRED).not.toHaveLength(0);
  });

  // The syntactic scan mints standards the catalog has never heard of, so it must be sure
  // the user named a body; the lexicon only ever returns one of its own, and discounts it.
  it('mints no standard of its own, whatever designator follows it', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BODY_LOOKALIKES),
        fc.constantFrom(...DESIGNATORS),
        (word, designator) => {
          for (const query of [
            `${word} ${designator} M8 flat washer`,
            `M8 flat washer ${word} ${designator}`,
          ]) {
            const spec = parse(query);
            if (spec.standard === undefined) continue;

            expect(LEXICON_STANDARDS).toContain(spec.standard);
          }
        },
      ),
    );
  });

  it('reads no standard at all from a designator the lexicon pairs with no body', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BODY_LOOKALIKES), fc.constantFrom(...UNPAIRED), (word, n) => {
        expect(parse(`${word} ${n} M8 flat washer`).standard).toBeUndefined();
        expect(parse(`M8 flat washer ${word} ${n}`).standard).toBeUndefined();
      }),
    );
  });

  it('leaves the designator to be read as the attribute term it also is', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BODY_LOOKALIKES), (word) => {
        expect(parse(`${word} 316 M8 flat washer`).material).toEqual({
          value: 'ss_316',
          strength: 1,
        });
        expect(parse(`${word} a2 M8 flat washer`).material).toEqual({
          value: 'ss_a2',
          strength: 1,
        });
      }),
    );
  });

  it('still reads the standard when the user spelled the body itself', () => {
    for (const body of BODIES) {
      for (const designator of DESIGNATORS) {
        expect(parse(`${body} ${designator} M8 flat washer`).standard).toBe(
          `${body.toUpperCase()} ${designator.toUpperCase()}`,
        );
      }
    }
  });
});

/** The values docs/BRIEF.md 4 gives these terms, read off the specification and not off
 * the parser, so the cross below can assert an attribute was understood. */
const MATERIAL_AXIS = [
  ['A2', 'ss_a2'],
  ['316', 'ss_316'],
  ['304', 'ss_18_8'],
  ['brass', 'brass'],
] as const;

const FINISH_AXIS = [
  ['zinc', 'zinc'],
  ['yellow zinc', 'yellow_zinc'],
  ['hdg', 'hdg'],
  ['black oxide', 'black_oxide'],
] as const;

const SIZE_AXIS = [
  ['M8 x 50mm', 'M8', { value: 50, unit: 'mm', mm: 50 }],
  ['1/2-13 x 2"', '1/2', { value: 2, unit: 'in', mm: 50.8 }],
] as const;

const INTENT_TAILS = ['A2 M8 flat washers', '316 M8 flat washers', 'zinc M8 x 50mm BHCS'];

describe('an intent phrase crossed with the attributes of the same query', () => {
  it.each([...INTENT_PHRASES])('keeps %s an intent and still reads the rest', (phrase) => {
    for (const [material, materialValue] of MATERIAL_AXIS) {
      for (const [finish, finishValue] of FINISH_AXIS) {
        for (const [size, nominal, length] of SIZE_AXIS) {
          const { spec, intentCandidates } = parseQuery(
            `${phrase} ${material} ${finish} ${size} hex cap screw`,
          );

          expect(intentCandidates).toContain(phrase);
          expect(spec.material).toEqual({ value: materialValue, strength: 1 });
          expect(spec.finish).toEqual({ value: finishValue, strength: 1 });
          expect(spec.diameter?.nominal).toBe(nominal);
          expect(spec.length).toEqual(length);
          expect(spec.standard).toBeUndefined();
        }
      }
    }
  });

  it.each([...INTENT_PHRASES])('invents no standard from the designator after %s', (phrase) => {
    for (const [material, value] of MATERIAL_AXIS) {
      const { spec, intentCandidates } = parseQuery(`${phrase} ${material} M8 flat washers`);

      expect(intentCandidates).toContain(phrase);
      expect(spec.material).toEqual({ value, strength: 1 });
      expect(spec.standard).toBeUndefined();
      expect(spec.residue).toEqual([]);
    }
  });

  // The invariant the regression broke: which phrase carries the intent decides nothing
  // about how the words beside it are read.
  it.each(INTENT_TAILS)('reads %s the same way whichever phrase carries the intent', (tail) => {
    const [first = {}, ...rest] = INTENT_PHRASES.map((phrase) =>
      values(parse(`${phrase} ${tail}`)),
    );

    for (const spec of rest) expect(spec).toEqual(first);
  });

  it('reads a phrase the corrector could carry onto a standards body as the intent', () => {
    const reachable = INTENT_PHRASES.filter(reachesBody);

    expect(reachable).not.toHaveLength(0);

    for (const phrase of reachable) {
      const { spec, intentCandidates } = parseQuery(`${phrase} a2 M8 flat washer`);

      expect(intentCandidates).toContain(phrase);
      expect(spec.standard).toBeUndefined();
      expect(spec.material).toEqual({ value: 'ss_a2', strength: 1 });
    }
  });

  it('still reads a standard the user spelled out beside an intent phrase', () => {
    for (const phrase of INTENT_PHRASES) {
      const { spec, intentCandidates } = parseQuery(`${phrase} M8 flat washer DIN 125`);

      expect(intentCandidates).toContain(phrase);
      expect(spec.standard).toBe('DIN 125');
    }
  });
});

interface DimensionFamily {
  readonly head: string;
  /** From the literal and 25.4 mm to the inch, never from the parser. */
  readonly length: Length;
  /** Spellings that carry their own unit, and spellings that leave it to the diameter. */
  readonly stated: readonly string[];
  readonly bare: readonly string[];
}

const DIMENSION_FAMILIES: readonly DimensionFamily[] = [
  {
    head: '3/4-10 tap bolt',
    length: { value: 0.625, unit: 'in', mm: 15.875 },
    stated: ['5/8"', '5/8 inch', '5/8 in', '0.625"', '0.625 inch'],
    bare: ['5/8', '0.625'],
  },
  {
    head: '1/2-13 hex cap screw',
    length: { value: 2, unit: 'in', mm: 50.8 },
    stated: ['2"', '2 inch', '2 in'],
    bare: ['2'],
  },
  {
    head: 'M8 SHCS',
    length: { value: 30, unit: 'mm', mm: 30 },
    stated: ['30mm', '30 mm', '30 millimeters'],
    bare: ['30'],
  },
  {
    head: 'M8 SHCS',
    length: { value: 12.5, unit: 'mm', mm: 12.5 },
    stated: ['12.5mm', '12.5 mm', '12-1/2 mm'],
    bare: [],
  },
];

describe('a dimension crossed with its spelling and the words around it', () => {
  it.each(DIMENSION_FAMILIES)(
    'reads every stated spelling of $length.value $length.unit after $head as the one dimension',
    (family) => {
      for (const literal of family.stated) {
        expect(parse(`${family.head} ${literal}`).length).toEqual(family.length);

        for (const word of GAP_WORDS) {
          expect(parse(`${family.head} ${word} ${literal}`).length).toEqual(family.length);
        }
      }
    },
  );

  it.each(DIMENSION_FAMILIES)(
    'keeps the diameter of $head whichever spelling states the dimension',
    (family) => {
      const nominal = parse(family.head).diameter?.nominal;

      for (const literal of [...family.stated, ...family.bare]) {
        for (const query of [`${family.head} ${literal}`, `${family.head} red ${literal}`]) {
          expect(parse(query).diameter?.nominal).toBe(nominal);
        }
      }
    },
  );

  // The other half of the rule: a bare number is a dimension where the separator sets it
  // apart, and is not one where an unrecognized word is all that stands beside it.
  it.each(DIMENSION_FAMILIES)(
    'reads a bare $length.value only where the query delimits it',
    (family) => {
      for (const literal of family.bare) {
        expect(parse(`${family.head} ${literal}`).length).toEqual(family.length);

        for (const word of GAP_WORDS) {
          expect(parse(`${family.head} ${word} x ${literal}`).length).toEqual(family.length);
          expect(parse(`${family.head} ${word} ${literal}`).length).toBeUndefined();
        }
      }
    },
  );

  it('reads a stated spelling behind any unrecognized word at all', () => {
    fc.assert(
      fc.property(fc.constantFrom(...DIMENSION_FAMILIES), unrecognizedWord, (family, word) => {
        for (const literal of family.stated) {
          expect(parse(`${family.head} ${word} ${literal}`).length).toEqual(family.length);
        }
      }),
    );
  });

  it('marks a stated unit explicit however the query spelled it', () => {
    for (const family of DIMENSION_FAMILIES) {
      for (const literal of family.stated) {
        expect(parse(`${family.head} length ${literal}`).provenance.length).toBe('explicit');
      }
    }
  });
});
