import { describe, expect, it } from 'vitest';

import type { CatalogItem } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import { DEFAULT_MATCHER_CONFIG } from './config';
import { attributeCredit, compatibility } from './ranking';

const config = DEFAULT_MATCHER_CONFIG;

const spec = (fields: Partial<ParsedSpec>): ParsedSpec => ({
  residue: [],
  evidence: {},
  provenance: {},
  ...fields,
});

let nextId = 0;
const item = (fields: Partial<ParsedSpec>): CatalogItem => {
  nextId += 1;
  return {
    catalogId: `CAT-${String(nextId).padStart(4, '0')}`,
    sku: `SKU-${String(nextId).padStart(4, '0')}`,
    description: 'test item',
    active: true,
    spec: spec(fields),
  };
};

const M8 = { system: 'metric', nominal: 'M8', mm: 8, known: true } as const;
const M10 = { system: 'metric', nominal: 'M10', mm: 10, known: true } as const;
const HALF = { system: 'imperial', nominal: '1/2', mm: 12.7, known: true } as const;

describe('attributeCredit: unspecified attributes', () => {
  it('gives full credit for every attribute the query does not state', () => {
    const query = spec({});
    const candidate = item({ diameter: M8, standard: 'DIN 912' });

    for (const attr of ['diameter', 'length', 'type', 'material', 'finish', 'standard'] as const) {
      expect(attributeCredit(attr, query, candidate, config)).toBe(1);
    }
  });
});

describe('attributeCredit: diameter', () => {
  it('gives full credit when the nominal agrees', () => {
    expect(
      attributeCredit('diameter', spec({ diameter: M8 }), item({ diameter: M8 }), config),
    ).toBe(1);
  });

  it('contradicts when the nominal differs', () => {
    expect(
      attributeCredit('diameter', spec({ diameter: M8 }), item({ diameter: M10 }), config),
    ).toBe(0);
  });

  it('never grants family credit: a diameter agrees exactly or not at all', () => {
    expect(
      attributeCredit('diameter', spec({ diameter: M8 }), item({ diameter: HALF }), config),
    ).toBe(0);
  });

  it('contradicts when the item carries no diameter at all', () => {
    expect(attributeCredit('diameter', spec({ diameter: M8 }), item({}), config)).toBe(0);
  });
});

describe('attributeCredit: length', () => {
  const mm = (value: number) => ({ value, unit: 'mm', mm: value }) as const;

  it('gives full credit when the length agrees', () => {
    expect(
      attributeCredit('length', spec({ length: mm(45) }), item({ length: mm(45) }), config),
    ).toBe(1);
  });

  it('contradicts a different length: approximate lengths belong to backoff, not ranking', () => {
    expect(
      attributeCredit('length', spec({ length: mm(45) }), item({ length: mm(40) }), config),
    ).toBe(0);
  });

  it('matches an inch length against its millimetre value despite float error', () => {
    // 0.75 * 25.4 is 19.049999999999997, so an exact comparison would contradict.
    const threeQuarterInch = { value: 0.75, unit: 'in', mm: 0.75 * 25.4 } as const;
    const catalogued = { value: 19.05, unit: 'mm', mm: 19.05 } as const;

    expect(
      attributeCredit(
        'length',
        spec({ length: threeQuarterInch }),
        item({ length: catalogued }),
        config,
      ),
    ).toBe(1);
  });

  it('contradicts when the item carries no length', () => {
    expect(attributeCredit('length', spec({ length: mm(45) }), item({}), config)).toBe(0);
  });
});

describe('attributeCredit: standard', () => {
  it('gives full credit when the standard agrees', () => {
    expect(
      attributeCredit(
        'standard',
        spec({ standard: 'DIN 912' }),
        item({ standard: 'DIN 912' }),
        config,
      ),
    ).toBe(1);
  });

  it('contradicts a different standard', () => {
    expect(
      attributeCredit(
        'standard',
        spec({ standard: 'DIN 912' }),
        item({ standard: 'DIN 933' }),
        config,
      ),
    ).toBe(0);
  });

  it('contradicts when the item carries no standard', () => {
    expect(attributeCredit('standard', spec({ standard: 'DIN 912' }), item({}), config)).toBe(0);
  });
});

describe('attributeCredit: type', () => {
  it('gives the strength the parser assigned to the reading that matches', () => {
    const query = spec({ type: [{ value: 'hex_cap_screw', strength: 1 }] });

    expect(
      attributeCredit(
        'type',
        query,
        item({ type: [{ value: 'hex_cap_screw', strength: 1 }] }),
        config,
      ),
    ).toBe(1);
  });

  it('carries a weak term through at its own strength', () => {
    const query = spec({
      type: [
        { value: 'hex_cap_screw', strength: 0.5 },
        { value: 'tap_bolt', strength: 0.5 },
        { value: 'lag_screw', strength: 0.5 },
      ],
    });

    expect(
      attributeCredit('type', query, item({ type: [{ value: 'lag_screw', strength: 1 }] }), config),
    ).toBe(0.5);
  });

  it('keeps a hex-head family term at the strength the lexicon gave it', () => {
    // docs/DESIGN.md 5.2: hex-head terms cover hex cap screw and tap bolt at full
    // strength. Ranking reads that strength; it does not re-apply familyCredit.
    const query = spec({
      type: [
        { value: 'hex_cap_screw', strength: 1 },
        { value: 'tap_bolt', strength: 1 },
      ],
    });

    expect(
      attributeCredit('type', query, item({ type: [{ value: 'tap_bolt', strength: 1 }] }), config),
    ).toBe(1);
  });

  it('takes the strongest reading when several match', () => {
    const query = spec({
      type: [
        { value: 'flat_washer', strength: 0.6 },
        { value: 'flat_washer', strength: 0.9 },
      ],
    });

    expect(
      attributeCredit(
        'type',
        query,
        item({ type: [{ value: 'flat_washer', strength: 1 }] }),
        config,
      ),
    ).toBe(0.9);
  });

  it('contradicts when no reading matches the item', () => {
    const query = spec({ type: [{ value: 'hex_nut', strength: 1 }] });

    expect(
      attributeCredit(
        'type',
        query,
        item({ type: [{ value: 'flat_washer', strength: 1 }] }),
        config,
      ),
    ).toBe(0);
  });
});

describe('attributeCredit: material and finish', () => {
  it('gives full credit for an exact material', () => {
    const query = spec({ material: { value: 'ss_18_8', strength: 1 } });

    expect(
      attributeCredit(
        'material',
        query,
        item({ material: { value: 'ss_18_8', strength: 1 } }),
        config,
      ),
    ).toBe(1);
  });

  it('gives familyCredit when the query names a family and the item a member', () => {
    const query = spec({ material: { value: 'stainless', strength: 1 } });

    expect(
      attributeCredit(
        'material',
        query,
        item({ material: { value: 'ss_316', strength: 1 } }),
        config,
      ),
    ).toBe(0.8);
  });

  it('multiplies term strength by familyCredit when the term is both fuzzy and a family', () => {
    const query = spec({ material: { value: 'stainless', strength: 0.9 } });

    expect(
      attributeCredit(
        'material',
        query,
        item({ material: { value: 'ss_a2', strength: 1 } }),
        config,
      ),
    ).toBeCloseTo(0.72, 10);
  });

  it('contradicts a material outside the named family', () => {
    const query = spec({ material: { value: 'stainless', strength: 1 } });

    expect(
      attributeCredit(
        'material',
        query,
        item({ material: { value: 'brass', strength: 1 } }),
        config,
      ),
    ).toBe(0);
  });

  it('gives familyCredit for the zinc family over a specific zinc', () => {
    const query = spec({ finish: { value: 'zinc_family', strength: 1 } });

    expect(
      attributeCredit(
        'finish',
        query,
        item({ finish: { value: 'yellow_zinc', strength: 1 } }),
        config,
      ),
    ).toBe(0.8);
  });

  it('gives full credit for an exact finish', () => {
    const query = spec({ finish: { value: 'black_oxide', strength: 0.7 } });

    expect(
      attributeCredit(
        'finish',
        query,
        item({ finish: { value: 'black_oxide', strength: 1 } }),
        config,
      ),
    ).toBe(0.7);
  });

  it('contradicts a finish outside the named family', () => {
    const query = spec({ finish: { value: 'zinc_family', strength: 1 } });

    expect(
      attributeCredit('finish', query, item({ finish: { value: 'hdg', strength: 1 } }), config),
    ).toBe(0);
  });

  it('contradicts when the item carries no material', () => {
    const query = spec({ material: { value: 'brass', strength: 1 } });

    expect(attributeCredit('material', query, item({}), config)).toBe(0);
  });
});

describe('compatibility', () => {
  const fullySpecified = spec({
    diameter: M8,
    length: { value: 45, unit: 'mm', mm: 45 },
    type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    material: { value: 'ss_18_8', strength: 1 },
    finish: { value: 'plain', strength: 1 },
    standard: 'DIN 912',
  });

  const exactItem = () =>
    item({
      diameter: M8,
      length: { value: 45, unit: 'mm', mm: 45 },
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      material: { value: 'ss_18_8', strength: 1 },
      finish: { value: 'plain', strength: 1 },
      standard: 'DIN 912',
    });

  it('reaches 1 when every stated attribute agrees exactly', () => {
    expect(compatibility(fullySpecified, exactItem(), config)).toBe(1);
  });

  it('ignores attributes the query never stated', () => {
    const query = spec({ diameter: M8 });

    expect(compatibility(query, exactItem(), config)).toBe(1);
  });

  it('multiplies the credits of the attributes that agree only partially', () => {
    const query = spec({
      diameter: M8,
      type: [
        { value: 'hex_cap_screw', strength: 0.5 },
        { value: 'tap_bolt', strength: 0.5 },
      ],
      material: { value: 'stainless', strength: 1 },
    });
    const candidate = item({
      diameter: M8,
      type: [{ value: 'tap_bolt', strength: 1 }],
      material: { value: 'ss_316', strength: 1 },
    });

    expect(compatibility(query, candidate, config)).toBeCloseTo(0.4, 10);
  });

  it('stays inside (0, 1] for any item it accepts', () => {
    const query = spec({ material: { value: 'stainless', strength: 0.9 } });
    const candidate = item({ material: { value: 'ss_a2', strength: 1 } });
    const s = compatibility(query, candidate, config);

    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('throws when an attribute contradicts, because the item is outside C', () => {
    const query = spec({ diameter: M8 });
    const candidate = item({ diameter: M10 });

    expect(() => compatibility(query, candidate, config)).toThrow(/outside the compatible set/i);
  });

  it('names the contradicting attribute and the item in the error', () => {
    const query = spec({ material: { value: 'brass', strength: 1 } });
    const candidate = item({ material: { value: 'steel', strength: 1 } });

    expect(() => compatibility(query, candidate, config)).toThrow(/material/);
    expect(() => compatibility(query, candidate, config)).toThrow(candidate.sku);
  });
});
