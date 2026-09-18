import { describe, expect, it } from 'vitest';

import { ITEMS } from '../../test/fixtures/items';
import { ATTRIBUTE_NAMES } from '../domain/spec';
import type { ParsedSpec } from '../domain/spec';
import { DEFAULT_MATCHER_CONFIG } from './config';
import {
  alternatives,
  compatibleSet,
  deriveStatus,
  disambiguateBy,
  failedConstraint,
} from './compatibility';

const CONFIG = DEFAULT_MATCHER_CONFIG;

describe('fixtures', () => {
  it('holds seven active M8 flat washers and one discontinued', () => {
    const washers = ITEMS.filter(
      (i) => i.spec.diameter?.nominal === 'M8' && i.spec.type?.[0]?.value === 'flat_washer',
    );
    expect(washers.filter((i) => i.active)).toHaveLength(7);
    expect(washers.filter((i) => !i.active).map((i) => i.catalogId)).toEqual(['CAT-0619']);
  });

  it('holds the eight distinct M8 socket head cap screws', () => {
    const screws = ITEMS.filter(
      (i) =>
        i.spec.diameter?.nominal === 'M8' && i.spec.type?.[0]?.value === 'socket_head_cap_screw',
    );
    expect(screws).toHaveLength(8);
    expect(new Set(screws.map((i) => i.sku)).size).toBe(8);
  });

  it('has no M14 item, because its absence is what M14 queries test', () => {
    expect(ITEMS.some((i) => i.spec.diameter?.nominal === 'M14')).toBe(false);
  });

  it('gives every item a unique SKU, as the repository does at load', () => {
    expect(new Set(ITEMS.map((i) => i.sku)).size).toBe(ITEMS.length);
  });
});

function query(partial: Partial<ParsedSpec> = {}): ParsedSpec {
  return { residue: [], evidence: {}, provenance: {}, ...partial };
}

const M8 = { system: 'metric', nominal: 'M8', mm: 8, known: true } as const;

describe('compatibleSet', () => {
  it('keeps the seven active M8 flat washers and drops the discontinued one', () => {
    const c = compatibleSet(
      query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] }),
      ITEMS,
    );
    expect(c).toHaveLength(7);
    expect(c.some((i) => i.catalogId === 'CAT-0619')).toBe(false);
  });

  it('treats a named standard as a constraint', () => {
    const c = compatibleSet(
      query({
        diameter: M8,
        type: [{ value: 'flat_washer', strength: 1 }],
        standard: 'DIN 912',
      }),
      ITEMS,
    );
    expect(c.map((i) => i.catalogId)).toEqual(['CAT-0624']);
  });

  it('accepts a family material and rejects a contradicting one', () => {
    const half = { system: 'imperial', nominal: '1/2', mm: 12.7, known: true } as const;
    const nut = [{ value: 'hex_nut', strength: 1 }] as const;

    const stainless = compatibleSet(
      query({ diameter: half, type: [...nut], material: { value: 'stainless', strength: 0.8 } }),
      ITEMS,
    );
    // SKU order, not catalogId order: PXNUT1221288PL0768 sorts before PXNUT126A2BO0038.
    expect(stainless.map((i) => i.catalogId)).toEqual(['CAT-0768', 'CAT-0038']);

    const brass = compatibleSet(
      query({ diameter: half, type: [...nut], material: { value: 'brass', strength: 1 } }),
      ITEMS,
    );
    expect(brass.map((i) => i.catalogId)).toEqual(['CAT-0107']);
  });

  it('does not let a specific stainless grade match another grade', () => {
    const half = { system: 'imperial', nominal: '1/2', mm: 12.7, known: true } as const;
    const c = compatibleSet(
      query({
        diameter: half,
        type: [{ value: 'hex_nut', strength: 1 }],
        material: { value: 'ss_316', strength: 1 },
      }),
      ITEMS,
    );
    expect(c).toHaveLength(0);
  });

  it('covers the hex-head family through the query candidate list', () => {
    const c = compatibleSet(
      query({
        diameter: { system: 'imperial', nominal: '3/4', mm: 19.05, known: true },
        type: [
          { value: 'hex_cap_screw', strength: 1 },
          { value: 'tap_bolt', strength: 1 },
        ],
        length: { value: 0.625, unit: 'in', mm: 15.875 },
      }),
      ITEMS,
    );
    expect(c.map((i) => i.catalogId)).toEqual(['CAT-0384']);
  });

  it('empties C for an unknown diameter', () => {
    const m14 = { system: 'metric', nominal: 'M14', mm: 14, known: false } as const;
    expect(
      compatibleSet(query({ diameter: m14, type: [{ value: 'hex_nut', strength: 1 }] }), ITEMS),
    ).toHaveLength(0);
  });

  it('empties C when the parser saw a type phrase it could not recognize', () => {
    const c = compatibleSet(
      query({
        diameter: { system: 'imperial', nominal: '3/8', mm: 9.525, known: true },
        residue: ['carriage', 'bolt'],
        provenance: { type: 'unrecognized' },
      }),
      ITEMS,
    );
    expect(c).toHaveLength(0);
  });

  it('ignores residue when deciding membership', () => {
    const withResidue = compatibleSet(
      query({
        diameter: M8,
        type: [{ value: 'flat_washer', strength: 1 }],
        residue: ['nylon', 'insert'],
      }),
      ITEMS,
    );
    expect(withResidue).toHaveLength(7);
  });

  it('returns items in SKU order regardless of input order', () => {
    const spec = query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] });
    const forward = compatibleSet(spec, ITEMS).map((i) => i.sku);
    const reversed = compatibleSet(spec, [...ITEMS].reverse()).map((i) => i.sku);
    expect(forward).toEqual([...forward].sort());
    expect(reversed).toEqual(forward);
  });
});

describe('deriveStatus', () => {
  const run = (spec: ParsedSpec) => deriveStatus(spec, compatibleSet(spec, ITEMS));

  it('is ambiguous for M8 flat washer', () => {
    expect(run(query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] }))).toBe(
      'ambiguous',
    );
  });

  it('is unique for M8 flat washer DIN 912', () => {
    expect(
      run(
        query({
          diameter: M8,
          type: [{ value: 'flat_washer', strength: 1 }],
          standard: 'DIN 912',
        }),
      ),
    ).toBe('unique');
  });

  it('is none for an unknown diameter', () => {
    const m14 = { system: 'metric', nominal: 'M14', mm: 14, known: false } as const;
    expect(run(query({ diameter: m14, type: [{ value: 'hex_nut', strength: 1 }] }))).toBe('none');
  });

  it('is none, not unparsed, when the diameter parsed but the type did not', () => {
    expect(
      run(
        query({
          diameter: { system: 'imperial', nominal: '3/8', mm: 9.525, known: true },
          residue: ['carriage', 'bolt'],
          provenance: { type: 'unrecognized' },
        }),
      ),
    ).toBe('none');
  });

  it('is unparsed when neither a diameter nor a type was recognized', () => {
    expect(run(query({ residue: ['carriage', 'bolt'], provenance: { type: 'unrecognized' } }))).toBe(
      'unparsed',
    );
  });

  it('decides unparsed before it looks at C', () => {
    expect(deriveStatus(query({ residue: ['red', 'thing'] }), ITEMS)).toBe('unparsed');
  });
});

describe('disambiguateBy', () => {
  it('names material, finish and standard for M8 flat washer', () => {
    const c = compatibleSet(
      query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] }),
      ITEMS,
    );
    expect(disambiguateBy(c)).toEqual(['material', 'finish', 'standard']);
  });

  it('returns nothing for a set of one', () => {
    const c = compatibleSet(
      query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }], standard: 'DIN 912' }),
      ITEMS,
    );
    expect(disambiguateBy(c)).toEqual([]);
  });

  it('returns nothing for an empty set', () => {
    expect(disambiguateBy([])).toEqual([]);
  });

  it('reports attributes in ATTRIBUTE_NAMES order', () => {
    const c = compatibleSet(
      query({ diameter: M8, type: [{ value: 'socket_head_cap_screw', strength: 1 }] }),
      ITEMS,
    );
    const result = disambiguateBy(c);
    const positions = result.map((attr) => ATTRIBUTE_NAMES.indexOf(attr));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(result).toContain('length');
  });
});

describe('failedConstraint', () => {
  it('names length when the diameter and type both exist', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      length: { value: 45, unit: 'mm', mm: 45 },
    });
    expect(failedConstraint(spec, ITEMS)).toBe('length');
  });

  it('names diameter for M14', () => {
    const m14 = { system: 'metric', nominal: 'M14', mm: 14, known: false } as const;
    const spec = query({ diameter: m14, type: [{ value: 'hex_nut', strength: 1 }] });
    expect(failedConstraint(spec, ITEMS)).toBe('diameter');
  });

  it('names type for an unrecognized type phrase', () => {
    const spec = query({
      diameter: { system: 'imperial', nominal: '3/8', mm: 9.525, known: true },
      residue: ['carriage', 'bolt'],
      provenance: { type: 'unrecognized' },
    });
    expect(failedConstraint(spec, ITEMS)).toBe('type');
  });

  it('is undefined when C is not empty', () => {
    const spec = query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] });
    expect(failedConstraint(spec, ITEMS)).toBeUndefined();
  });

  it('is undefined when the query states no constraint at all', () => {
    expect(failedConstraint(query({ residue: ['red'] }), ITEMS)).toBeUndefined();
  });

  it('is undefined for an empty catalog rather than blaming the first probe', () => {
    const spec = query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] });
    expect(failedConstraint(spec, [])).toBeUndefined();
  });
});

describe('alternatives', () => {
  it('falls through to dropping length for M8 x 45mm SHCS and ranks by distance', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      length: { value: 45, unit: 'mm', mm: 45 },
    });
    const found = alternatives(spec, ITEMS, CONFIG);

    expect(found).toHaveLength(8);
    expect(found.slice(0, 3).map((a) => a.item.catalogId)).toEqual([
      'CAT-0508',
      'CAT-0004',
      'CAT-0008',
    ]);
    expect(found[0]?.relaxed).toEqual(['length']);
    expect(found[0]?.closeness).toBeCloseTo(2 / 3, 10);
  });

  it('offers the 16 mm hex cap screw for M8 x 3/4, not a 20 mm item', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'hex_cap_screw', strength: 1 }],
      length: { value: 0.75, unit: 'in', mm: 19.05 },
    });
    const found = alternatives(spec, ITEMS, CONFIG);

    expect(found.map((a) => a.item.catalogId)).toEqual(['CAT-0387']);
    expect(found[0]?.item.spec.length?.mm).toBe(16);
    expect(found[0]?.relaxed).toEqual(['length']);
  });

  it('never relaxes an unknown diameter', () => {
    const m14 = { system: 'metric', nominal: 'M14', mm: 14, known: false } as const;
    expect(
      alternatives(query({ diameter: m14, type: [{ value: 'hex_nut', strength: 1 }] }), ITEMS, CONFIG),
    ).toEqual([]);
  });

  it('never relaxes an unrecognized type', () => {
    const spec = query({
      diameter: { system: 'imperial', nominal: '3/8', mm: 9.525, known: true },
      residue: ['carriage', 'bolt'],
      provenance: { type: 'unrecognized' },
    });
    expect(alternatives(spec, ITEMS, CONFIG)).toEqual([]);
  });

  it('stops at the first step, dropping an unmatched standard', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'flat_washer', strength: 1 }],
      standard: 'DIN 999',
    });
    const found = alternatives(spec, ITEMS, CONFIG);

    expect(found).toHaveLength(7);
    expect(found[0]?.relaxed).toEqual(['standard']);
    expect(found[0]?.closeness).toBeCloseTo(2 / 3, 10);
    expect(found.map((a) => a.item.sku)).toEqual([...found.map((a) => a.item.sku)].sort());
  });

  it('widens a concrete material to its family at step two', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'flat_washer', strength: 1 }],
      material: { value: 'ss_316', strength: 1 },
      finish: { value: 'plain', strength: 1 },
    });
    const found = alternatives(spec, ITEMS, CONFIG);

    expect(found.map((a) => a.item.catalogId)).toEqual(['CAT-0688']);
    expect(found[0]?.relaxed).toEqual(['material', 'finish']);
    expect(found[0]?.closeness).toBeCloseTo(2 / 4, 10);
  });

  it('returns nothing when there is no length to relax and no standard to drop', () => {
    const m14 = { system: 'metric', nominal: 'M14', mm: 14, known: false } as const;
    expect(alternatives(query({ diameter: m14 }), ITEMS, CONFIG)).toEqual([]);
  });

  it('is independent of input order', () => {
    const spec = query({
      diameter: M8,
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      length: { value: 45, unit: 'mm', mm: 45 },
    });
    const forward = alternatives(spec, ITEMS, CONFIG).map((a) => a.item.catalogId);
    const reversed = alternatives(spec, [...ITEMS].reverse(), CONFIG).map((a) => a.item.catalogId);
    expect(reversed).toEqual(forward);
  });
});

describe('DESIGN 6 acceptance criteria', () => {
  const evaluate = (spec: ParsedSpec) => {
    const c = compatibleSet(spec, ITEMS);
    return {
      c,
      status: deriveStatus(spec, c),
      disambiguateBy: disambiguateBy(c),
      failed: failedConstraint(spec, ITEMS),
      alternatives: alternatives(spec, ITEMS, CONFIG),
    };
  };

  it('HHB 3/4-10 x 5/8 is unique and resolves to the tap bolt', () => {
    const result = evaluate(
      query({
        diameter: { system: 'imperial', nominal: '3/4', mm: 19.05, known: true },
        type: [
          { value: 'hex_cap_screw', strength: 1 },
          { value: 'tap_bolt', strength: 1 },
        ],
        length: { value: 0.625, unit: 'in', mm: 15.875 },
      }),
    );
    expect(result.status).toBe('unique');
    expect(result.c[0]?.catalogId).toBe('CAT-0384');
    expect(result.c[0]?.spec.type?.[0]?.value).toBe('tap_bolt');
  });

  it('brass hex nut 1/2-13 returns brass only', () => {
    const result = evaluate(
      query({
        diameter: { system: 'imperial', nominal: '1/2', mm: 12.7, known: true },
        type: [{ value: 'hex_nut', strength: 1 }],
        material: { value: 'brass', strength: 1 },
      }),
    );
    expect(result.status).toBe('unique');
    expect(result.c.map((i) => i.catalogId)).toEqual(['CAT-0107']);
  });

  it('M14 hex nut is none with a diameter note and no alternatives', () => {
    const result = evaluate(
      query({
        diameter: { system: 'metric', nominal: 'M14', mm: 14, known: false },
        type: [{ value: 'hex_nut', strength: 1 }],
      }),
    );
    expect(result.status).toBe('none');
    expect(result.failed).toBe('diameter');
    expect(result.alternatives).toEqual([]);
  });

  it('the discontinued M8 brass black oxide flat washer never enters C', () => {
    const everyQuery = [
      query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] }),
      query({
        diameter: M8,
        type: [{ value: 'flat_washer', strength: 1 }],
        material: { value: 'brass', strength: 1 },
      }),
      query({
        diameter: M8,
        type: [{ value: 'flat_washer', strength: 1 }],
        finish: { value: 'black_oxide', strength: 1 },
      }),
    ];
    for (const spec of everyQuery) {
      expect(compatibleSet(spec, ITEMS).some((i) => i.catalogId === 'CAT-0619')).toBe(false);
    }
  });
});

describe('determinism', () => {
  const specs: ParsedSpec[] = [
    query({ diameter: M8, type: [{ value: 'flat_washer', strength: 1 }] }),
    query({
      diameter: M8,
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      length: { value: 45, unit: 'mm', mm: 45 },
    }),
    query({ diameter: M8, type: [{ value: 'hex_cap_screw', strength: 1 }] }),
  ];

  it('gives byte-identical results when the catalog order changes', () => {
    const shuffled = [...ITEMS].reverse();
    for (const spec of specs) {
      const a = compatibleSet(spec, ITEMS).map((i) => i.catalogId);
      const b = compatibleSet(spec, shuffled).map((i) => i.catalogId);
      expect(b).toEqual(a);

      expect(alternatives(spec, shuffled, CONFIG).map((x) => x.item.catalogId)).toEqual(
        alternatives(spec, ITEMS, CONFIG).map((x) => x.item.catalogId),
      );
      expect(failedConstraint(spec, shuffled)).toBe(failedConstraint(spec, ITEMS));
    }
  });

  it('repeats itself exactly on a second call', () => {
    for (const spec of specs) {
      expect(compatibleSet(spec, ITEMS)).toEqual(compatibleSet(spec, ITEMS));
      expect(alternatives(spec, ITEMS, CONFIG)).toEqual(alternatives(spec, ITEMS, CONFIG));
    }
  });
});
