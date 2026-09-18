import { describe, expect, it } from 'vitest';

import type { QueryParser } from '../domain/contracts';
import type { ParsedSpec } from '../domain/spec';
import { ADVERSARIAL_QUERIES } from '../../test/fixtures/adversarial-queries';
import {
  EXAMPLE_QUERIES,
  type QueryFixture,
  type SpecValues,
} from '../../test/fixtures/example-queries';
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
