import { describe, expect, it } from 'vitest';

import { ITEMS } from '../../test/fixtures/items';
import { ATTRIBUTE_NAMES } from '../domain/spec';
import type { ParsedSpec } from '../domain/spec';
import { compatibleSet, deriveStatus, disambiguateBy, failedConstraint } from './compatibility';

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
