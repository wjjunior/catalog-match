import { describe, expect, it } from 'vitest';

import { DIAMETERS } from '../domain/diameters';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import {
  classifySizeToken,
  parseNumber,
  resolveDiameter,
  resolveLength,
  toInches,
  toMm,
  unitMismatch,
  withinTolerance,
} from './units';

describe('parseNumber', () => {
  it('reads a whole number', () => {
    expect(parseNumber('8')).toBe(8);
  });

  it('reads a decimal', () => {
    expect(parseNumber('2.5')).toBe(2.5);
  });

  it('reads a fraction', () => {
    expect(parseNumber('3/4')).toBe(0.75);
  });

  it('reads a mixed number written with a hyphen', () => {
    expect(parseNumber('1-1/4')).toBe(1.25);
  });

  it('reads a mixed number whose whole part is larger than one', () => {
    expect(parseNumber('2-1/2')).toBe(2.5);
  });

  it('rejects a token that is not a number', () => {
    expect(parseNumber('hex')).toBeUndefined();
  });

  it('rejects a fraction over zero', () => {
    expect(parseNumber('1/0')).toBeUndefined();
  });
});

describe('toMm', () => {
  it('leaves millimetres alone', () => {
    expect(toMm(30, 'mm')).toBe(30);
  });

  it('converts inches at 25.4 exactly', () => {
    expect(toMm(1, 'in')).toBe(25.4);
  });

  it('converts feet', () => {
    expect(toMm(6, 'ft')).toBe(1828.8);
  });

  it('rounds away the binary error that would otherwise miss the diameter table', () => {
    expect(0.75 * 25.4).not.toBe(19.05);
    expect(toMm(0.75, 'in')).toBe(19.05);
    expect(toMm(0.4375, 'in')).toBe(11.1125);
  });
});

describe('toInches', () => {
  it('leaves inches alone', () => {
    expect(toInches(0.75, 'in')).toBe(0.75);
  });

  it('converts feet', () => {
    expect(toInches(6, 'ft')).toBe(72);
  });

  it('converts millimetres', () => {
    expect(toInches(25.4, 'mm')).toBe(1);
  });
});

describe('classifySizeToken: threads', () => {
  it('reads an imperial fraction with its TPI', () => {
    expect(classifySizeToken('1/2-13')).toEqual({ kind: 'thread', nominal: '1/2', pitch: '13' });
  });

  it('reads a metric nominal with its pitch, upper-casing the M', () => {
    expect(classifySizeToken('m8-1.25')).toEqual({ kind: 'thread', nominal: 'M8', pitch: '1.25' });
  });

  it('reads a numbered nominal with its TPI', () => {
    expect(classifySizeToken('#8-32')).toEqual({ kind: 'thread', nominal: '#8', pitch: '32' });
  });

  it('reads a metric nominal with no pitch', () => {
    expect(classifySizeToken('m8')).toEqual({ kind: 'thread', nominal: 'M8' });
  });

  it('reads a bare fraction as a diameter, the shape the catalog uses on CAT-0006', () => {
    expect(classifySizeToken('1/2')).toEqual({ kind: 'thread', nominal: '1/2' });
  });

  it('reads a bare numbered nominal', () => {
    expect(classifySizeToken('#10')).toEqual({ kind: 'thread', nominal: '#10' });
  });

  it('keeps a non-catalog TPI as a thread so it can reach status none', () => {
    expect(classifySizeToken('1/2-20')).toEqual({ kind: 'thread', nominal: '1/2', pitch: '20' });
  });
});

describe('classifySizeToken: lengths', () => {
  it('reads a mixed number as a length, never as a thread', () => {
    expect(classifySizeToken('1-1/2')).toEqual({ kind: 'length', value: 1.5 });
  });

  it('reads an inch mark', () => {
    expect(classifySizeToken('3/4"')).toEqual({ kind: 'length', value: 0.75, unit: 'in' });
  });

  it('reads a millimetre length', () => {
    expect(classifySizeToken('60mm')).toEqual({ kind: 'length', value: 60, unit: 'mm' });
  });

  it('reads a foot length whatever its case', () => {
    expect(classifySizeToken('6FT')).toEqual({ kind: 'length', value: 6, unit: 'ft' });
  });

  it('reads a bare whole number as a length, leaving its unit to the diameter', () => {
    expect(classifySizeToken('30')).toEqual({ kind: 'length', value: 30 });
  });

  it('reads a spelled inch unit', () => {
    expect(classifySizeToken('1in')).toEqual({ kind: 'length', value: 1, unit: 'in' });
  });
});

describe('classifySizeToken: rejections', () => {
  it('rejects a word', () => {
    expect(classifySizeToken('washer')).toBeUndefined();
  });

  it('rejects a fraction-integer whose integer is no plausible TPI', () => {
    expect(classifySizeToken('1/2-900')).toBeUndefined();
  });

  it('rejects an empty token', () => {
    expect(classifySizeToken('')).toBeUndefined();
  });
});

describe('resolveDiameter', () => {
  it('resolves every catalog diameter as known, with the table millimetres', () => {
    for (const spec of DIAMETERS) {
      expect(resolveDiameter(spec.nominal)).toEqual({
        system: spec.system,
        nominal: spec.nominal,
        mm: spec.mm,
        known: true,
      });
    }
  });

  it('accepts a lower-case metric nominal, the form half the catalog rows use', () => {
    expect(resolveDiameter('m8')).toEqual({
      system: 'metric',
      nominal: 'M8',
      mm: 8,
      known: true,
    });
  });

  it('computes millimetres for a metric nominal outside the catalog', () => {
    expect(resolveDiameter('M14')).toEqual({
      system: 'metric',
      nominal: 'M14',
      mm: 14,
      known: false,
    });
  });

  it('computes millimetres for an imperial fraction outside the catalog', () => {
    expect(resolveDiameter('9/16')).toEqual({
      system: 'imperial',
      nominal: '9/16',
      mm: 14.2875,
      known: false,
    });
  });

  it('computes millimetres for a numbered size outside the catalog', () => {
    expect(resolveDiameter('#6')).toEqual({
      system: 'number',
      nominal: '#6',
      mm: 3.5052,
      known: false,
    });
  });

  it('rejects a nominal that is no diameter shape at all', () => {
    expect(resolveDiameter('washer')).toBeUndefined();
  });
});

function length(token: string, diameterNominal?: string) {
  const classified = classifySizeToken(token);
  if (classified === undefined) throw new Error(`unclassifiable token: ${token}`);
  const diameter = diameterNominal === undefined ? undefined : resolveDiameter(diameterNominal);
  return resolveLength(classified, diameter);
}

describe('resolveLength: stated units', () => {
  it('keeps a stated inch length explicit', () => {
    expect(length('1-1/4"')).toEqual({
      length: { value: 1.25, unit: 'in', mm: 31.75 },
      provenance: 'explicit',
    });
  });

  it('keeps a stated foot length explicit', () => {
    expect(length('6FT')).toEqual({
      length: { value: 6, unit: 'ft', mm: 1828.8 },
      provenance: 'explicit',
    });
  });

  it('keeps a stated millimetre length explicit', () => {
    expect(length('60mm')).toEqual({
      length: { value: 60, unit: 'mm', mm: 60 },
      provenance: 'explicit',
    });
  });
});

describe('resolveLength: inferred units', () => {
  it('reads a mixed number as inches even against a metric diameter', () => {
    expect(length('2-1/2', 'M8')).toEqual({
      length: { value: 2.5, unit: 'in', mm: 63.5 },
      provenance: 'inferred',
    });
  });

  it('reads a mixed number as inches against an imperial diameter', () => {
    expect(length('2-1/2', '1/2')).toEqual({
      length: { value: 2.5, unit: 'in', mm: 63.5 },
      provenance: 'inferred',
    });
  });

  it('gives a whole number the millimetres of a metric diameter', () => {
    expect(length('30', 'M8')).toEqual({
      length: { value: 30, unit: 'mm', mm: 30 },
      provenance: 'inferred',
    });
  });

  it('gives a whole number the inches of an imperial diameter', () => {
    expect(length('3', '1/2')).toEqual({
      length: { value: 3, unit: 'in', mm: 76.2 },
      provenance: 'inferred',
    });
  });

  it('gives a whole number the inches of a numbered diameter', () => {
    expect(length('2', '#8')).toEqual({
      length: { value: 2, unit: 'in', mm: 50.8 },
      provenance: 'inferred',
    });
  });

  it('leaves a whole number unresolved when no diameter names a system', () => {
    expect(length('3')).toBeUndefined();
  });

  it('reads a bare fraction as inches, the trailing-length form of "tap bolt 5/8"', () => {
    const classified = { kind: 'length', value: 0.625 } as const;

    expect(resolveLength(classified, resolveDiameter('M8'))).toEqual({
      length: { value: 0.625, unit: 'in', mm: 15.875 },
      provenance: 'inferred',
    });
  });

  it('refuses a thread token', () => {
    expect(resolveLength({ kind: 'thread', nominal: 'M8' }, undefined)).toBeUndefined();
  });
});

describe('unitMismatch', () => {
  it('flags an inch length against a metric diameter', () => {
    const resolved = length('3/4"');
    expect(resolved).toBeDefined();
    expect(unitMismatch(resolveDiameter('M8')!, resolved!.length)).toBe(true);
  });

  it('flags a millimetre length against an imperial diameter', () => {
    const resolved = length('30mm');
    expect(unitMismatch(resolveDiameter('1/2')!, resolved!.length)).toBe(true);
  });

  it('flags a millimetre length against a numbered diameter', () => {
    const resolved = length('30mm');
    expect(unitMismatch(resolveDiameter('#8')!, resolved!.length)).toBe(true);
  });

  it('accepts a millimetre length against a metric diameter', () => {
    const resolved = length('30mm');
    expect(unitMismatch(resolveDiameter('M8')!, resolved!.length)).toBe(false);
  });

  it('accepts an inch length against an imperial diameter', () => {
    const resolved = length('3/4"');
    expect(unitMismatch(resolveDiameter('1/2')!, resolved!.length)).toBe(false);
  });

  it('accepts a foot length against an imperial diameter', () => {
    const resolved = length('6FT');
    expect(unitMismatch(resolveDiameter('1/2')!, resolved!.length)).toBe(false);
  });
});

describe('withinTolerance', () => {
  const tolerance = DEFAULT_MATCHER_CONFIG.lengthTolerance;

  it('reads the tolerance as a fraction of the requested value, per DESIGN.md 5.6', () => {
    expect(withinTolerance(20, 19.05, tolerance)).toBe(true);
    expect(withinTolerance(16, 19.05, tolerance)).toBe(true);
    expect(withinTolerance(30, 19.05, tolerance)).toBe(false);
  });

  it('surfaces both neighbours of the M8 x 45mm case', () => {
    expect(withinTolerance(40, 45, tolerance)).toBe(true);
    expect(withinTolerance(50, 45, tolerance)).toBe(true);
    expect(withinTolerance(80, 45, tolerance)).toBe(false);
  });

  it('includes the band edges', () => {
    expect(withinTolerance(56.25, 45, tolerance)).toBe(true);
    expect(withinTolerance(33.75, 45, tolerance)).toBe(true);
  });
});

// Read off data/catalog.csv, not from the design document: every distinct diameter and
// length token the 960 rows use, including the lower-case rows and the two one-off forms
// (the bare 5/16 on CAT-0006, the unquoted 1-1/2 on CAT-0001).
const CATALOG_DIAMETER_TOKENS = [
  '1/4-20',
  '5/16-18',
  '5/16',
  '3/8-16',
  '7/16-14',
  '1/2-13',
  '5/8-11',
  '3/4-10',
  'M4-0.7',
  'M5-0.8',
  'M6-1.0',
  'M8-1.25',
  'M10-1.5',
  'M12-1.75',
  'M16-2.0',
  '#8-32',
  '#10-24',
  'm4-0.7',
  'm5-0.8',
  'm6-1.0',
  'm8-1.25',
  'm10-1.5',
  'm12-1.75',
  'm16-2.0',
];

const CATALOG_LENGTH_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ['1"', 25.4],
  ['1-1/2', 38.1],
  ['1-1/2"', 38.1],
  ['1-1/4"', 31.75],
  ['1/2"', 12.7],
  ['1/4"', 6.35],
  ['2"', 50.8],
  ['2-1/2"', 63.5],
  ['3"', 76.2],
  ['3/4"', 19.05],
  ['3/8"', 9.525],
  ['4"', 101.6],
  ['5/8"', 15.875],
  ['6FT', 1828.8],
  ['8MM', 8],
  ['10MM', 10],
  ['12MM', 12],
  ['16MM', 16],
  ['20MM', 20],
  ['25MM', 25],
  ['30MM', 30],
  ['40MM', 40],
  ['50MM', 50],
  ['60MM', 60],
  ['80MM', 80],
];

describe('catalog corpus', () => {
  it('classifies every catalog diameter token as a thread on a known nominal', () => {
    for (const token of CATALOG_DIAMETER_TOKENS) {
      const classified = classifySizeToken(token);

      expect(classified, token).toMatchObject({ kind: 'thread' });
      if (classified?.kind !== 'thread') continue;
      expect(resolveDiameter(classified.nominal), token).toMatchObject({ known: true });
    }
  });

  it('agrees with the catalog pitch on every diameter token that states one', () => {
    for (const token of CATALOG_DIAMETER_TOKENS) {
      const classified = classifySizeToken(token);
      if (classified?.kind !== 'thread' || classified.pitch === undefined) continue;
      const spec = DIAMETERS.find((entry) => entry.nominal === classified.nominal);

      expect(classified.pitch, token).toBe(spec?.pitch);
    }
  });

  it('converts every catalog length token to millimetres', () => {
    for (const [token, mm] of CATALOG_LENGTH_TOKENS) {
      const classified = classifySizeToken(token);

      expect(classified, token).toMatchObject({ kind: 'length' });
      if (classified?.kind !== 'length') continue;
      expect(resolveLength(classified, undefined)?.length.mm, token).toBe(mm);
    }
  });
});

describe('example-query forms', () => {
  it('reads a spaced inch unit', () => {
    expect(length('1/2 in')).toEqual({
      length: { value: 0.5, unit: 'in', mm: 12.7 },
      provenance: 'explicit',
    });
  });

  it('reads a spaced foot unit', () => {
    expect(length('6 ft')).toEqual({
      length: { value: 6, unit: 'ft', mm: 1828.8 },
      provenance: 'explicit',
    });
  });

  it('reads the numbered diameters of the example queries', () => {
    expect(classifySizeToken('#8-32')).toEqual({ kind: 'thread', nominal: '#8', pitch: '32' });
    expect(classifySizeToken('#10-24')).toEqual({ kind: 'thread', nominal: '#10', pitch: '24' });
  });
});

describe('acceptance criteria', () => {
  it('converts 6FT to 1828.8 mm', () => {
    expect(length('6FT')?.length.mm).toBe(1828.8);
  });

  it('converts 1-1/4" to 31.75 mm', () => {
    expect(length('1-1/4"')?.length.mm).toBe(31.75);
  });

  it('converts 2-1/2 against an imperial diameter to 63.5 mm', () => {
    expect(length('2-1/2', '1/2')?.length.mm).toBe(63.5);
  });

  it('reads 30 against a metric diameter as 30 mm, inferred', () => {
    expect(length('30', 'M8')).toEqual({
      length: { value: 30, unit: 'mm', mm: 30 },
      provenance: 'inferred',
    });
  });

  it('reads M8 x 3/4 as a unit mismatch at 19.05 mm', () => {
    const diameter = resolveDiameter('M8');
    const resolved = length('3/4"');

    expect(diameter).toBeDefined();
    expect(resolved).toBeDefined();
    if (diameter === undefined || resolved === undefined) return;

    expect(resolved.length.mm).toBe(19.05);
    expect(unitMismatch(diameter, resolved.length)).toBe(true);
    expect(withinTolerance(20, resolved.length.mm, DEFAULT_MATCHER_CONFIG.lengthTolerance)).toBe(
      true,
    );
  });
});
