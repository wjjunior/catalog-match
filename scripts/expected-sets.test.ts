import { describe, expect, it } from 'vitest';
import { activeSkus, compatibleSet, lengthMm } from './expected-sets';

describe('lengthMm', () => {
  it('reads a bare length as millimetres for a metric diameter', () => {
    expect(lengthMm('16', '', 'M8')).toBe(16);
  });

  it('reads a bare length as inches for an imperial diameter', () => {
    expect(lengthMm('5/8', '', '3/4')).toBeCloseTo(15.875, 6);
  });

  it('converts the explicit units', () => {
    expect(lengthMm('50', 'MM', 'M8')).toBe(50);
    expect(lengthMm('6', 'FT', '1/2')).toBeCloseTo(1828.8, 6);
    expect(lengthMm('3/4', '"', '1/4')).toBeCloseTo(19.05, 6);
  });

  it('reads a mixed number', () => {
    expect(lengthMm('2-1/2', '"', '7/16')).toBeCloseTo(63.5, 6);
  });

  it('returns null when there is no length', () => {
    expect(lengthMm(null, null, 'M8')).toBeNull();
  });
});

describe('compatibleSet', () => {
  // docs/data-profile.md anchors "M8 flat washer, active compatible SKUs | 7".
  it('reproduces the committed M8 flat washer anchor', () => {
    expect(activeSkus({ diameter: 'M8', types: ['WASH'] })).toEqual([
      'PXWASH812A2YZ0016',
      'PXWASH816A2BO0624',
      'PXWASH82536HG0974',
      'PXWASH825STYZ0009',
      'PXWASH830BRZC0520',
      'PXWASH850BRPL0440',
      'PXWASH88088PL0688',
    ]);
  });

  it('keeps inactive rows in the full result and drops them from activeSkus', () => {
    const all = compatibleSet({ diameter: 'M8', types: ['WASH'] });
    expect(all).toHaveLength(8);
    expect(all.filter((row) => !row.active).map((row) => row.sku)).toEqual(['PXWASH88BRBO0619']);
  });

  it('spans the 2-to-9 range docs/DESIGN.md 3.3 claims for the tie queries', () => {
    expect(activeSkus({ diameter: 'M4', types: ['NUT'] })).toHaveLength(2);
    expect(activeSkus({ diameter: 'M12', types: ['NUT'] })).toHaveLength(9);
    expect(activeSkus({ diameter: '5/16', types: ['WASH'] })).toHaveLength(9);
  });

  it('filters by length in millimetres across unit systems', () => {
    expect(activeSkus({ diameter: 'M8', types: ['HEX'], lengthMm: 16 })).toEqual([
      'PXHEX816ALBO0387',
    ]);
    expect(activeSkus({ diameter: '3/4', types: ['HEX', 'TAP'], lengthMm: 15.875 })).toEqual([
      'PXTAP3458STZC0384',
    ]);
  });

  it('filters by material family, finish family and standard', () => {
    expect(activeSkus({ diameter: 'M6', types: ['NUT'], materials: ['18-8 SS'] })).toEqual([
      'PXNUT66088PL0165',
    ]);
    expect(
      activeSkus({ diameter: '3/8', types: ['LAG'], lengthMm: 38.1, finishes: ['HDG'] }),
    ).toEqual(['PXLAG38112STHG0001']);
    expect(activeSkus({ diameter: '5/16', types: ['WASH'], standard: 'ASME B18.2.1' })).toEqual([
      'PXWASH51658A2HG0289',
    ]);
  });

  it('returns nothing for a length the catalog does not stock', () => {
    expect(activeSkus({ diameter: 'M8', types: ['SOC'], lengthMm: 45 })).toEqual([]);
  });
});
