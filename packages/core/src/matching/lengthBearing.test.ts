import { describe, expect, it } from 'vitest';

import { ITEMS } from '../../test/fixtures/items';
import type { CatalogItem } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import { bindLength, lengthBearingTypes } from './lengthBearing';

const query = (partial: Partial<ParsedSpec> = {}): ParsedSpec => ({
  residue: [],
  evidence: {},
  provenance: {},
  ...partial,
});

const M8 = { system: 'metric', nominal: 'M8', mm: 8, known: true } as const;
const SIXTY = { value: 60, unit: 'mm', mm: 60 } as const;

const NUT = [{ value: 'hex_nut', strength: 1 }] as const;
const WASHERS = [
  { value: 'flat_washer', strength: 0.8 },
  { value: 'lock_washer', strength: 0.8 },
] as const;

/** A hex nut that does carry a length, which the catalog has none of: the set is read off
 * the items, so a fixture that disagrees with the real catalog must move the answer. */
const lengthyNut: CatalogItem = {
  catalogId: 'CAT-9001',
  sku: 'FIXTURE-NUT-60',
  description: 'M8-1.25 X 60MM HEX NUT STEEL ZINC',
  active: true,
  spec: query({ diameter: M8, length: SIXTY, type: [{ value: 'hex_nut', strength: 1 }] }),
};

describe('lengthBearingTypes', () => {
  it('holds a type the items carry a length for', () => {
    expect(lengthBearingTypes(ITEMS).has('socket_head_cap_screw')).toBe(true);
  });

  // The fixture holds no lock washer at all, so the real catalog answers for that type
  // in packages/core/test/integration/matcher.length.test.ts.
  it('omits a type the items hold but never with a length', () => {
    const bearing = lengthBearingTypes(ITEMS);

    expect(ITEMS.some((item) => item.spec.type?.[0]?.value === 'hex_nut')).toBe(true);
    expect(bearing.has('hex_nut')).toBe(false);
    expect(bearing.has('flat_washer')).toBe(false);
  });

  it('reads the answer off the items rather than off a list of types', () => {
    expect(lengthBearingTypes([...ITEMS, lengthyNut]).has('hex_nut')).toBe(true);
  });

  it('is empty for no items at all', () => {
    expect(lengthBearingTypes([]).size).toBe(0);
  });
});

describe('bindLength', () => {
  it('lifts a length off a spec no named type can carry', () => {
    const bound = bindLength(query({ diameter: M8, length: SIXTY, type: [...NUT] }), ITEMS);

    expect(bound.spec.length).toBeUndefined();
    expect(bound.unbound).toEqual(SIXTY);
  });

  it('leaves the rest of the spec alone', () => {
    const spec = query({ diameter: M8, length: SIXTY, type: [...NUT], residue: ['nylon'] });
    const bound = bindLength(spec, ITEMS);

    expect(bound.spec.diameter).toEqual(M8);
    expect(bound.spec.type).toEqual([...NUT]);
    expect(bound.spec.residue).toEqual(['nylon']);
  });

  it('lifts when every reading of an ambiguous type is lengthless', () => {
    const bound = bindLength(query({ diameter: M8, length: SIXTY, type: [...WASHERS] }), ITEMS);

    expect(bound.spec.length).toBeUndefined();
  });

  it('keeps a length a named type can carry', () => {
    const spec = query({
      diameter: M8,
      length: SIXTY,
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    });
    const bound = bindLength(spec, ITEMS);

    expect(bound.spec).toBe(spec);
    expect(bound.unbound).toBeUndefined();
  });

  it('keeps a length when one reading of several can carry it', () => {
    const spec = query({
      diameter: M8,
      length: SIXTY,
      type: [
        { value: 'hex_nut', strength: 1 },
        { value: 'hex_cap_screw', strength: 1 },
      ],
    });

    expect(bindLength(spec, ITEMS).spec.length).toEqual(SIXTY);
  });

  it('keeps a length when the query names no type, because most types carry one', () => {
    const spec = query({ diameter: M8, length: SIXTY });

    expect(bindLength(spec, ITEMS).spec.length).toEqual(SIXTY);
  });

  it('has nothing to lift when the query states no length', () => {
    const spec = query({ diameter: M8, type: [...NUT] });
    const bound = bindLength(spec, ITEMS);

    expect(bound.spec).toBe(spec);
    expect(bound.unbound).toBeUndefined();
  });
});
