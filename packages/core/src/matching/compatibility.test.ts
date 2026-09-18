import { describe, expect, it } from 'vitest';

import { ITEMS } from '../../test/fixtures/items';
import type { ParsedSpec } from '../domain/spec';
import { compatibleSet } from './compatibility';

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
