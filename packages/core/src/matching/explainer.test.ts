import { describe, expect, it } from 'vitest';

import type {
  Finish,
  FinishFamily,
  Material,
  MaterialFamily,
  ProductType,
} from '../domain/attributes';
import { FINISHES, FINISH_FAMILIES, MATERIALS, MATERIAL_FAMILIES, PRODUCT_TYPES } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import type { Diameter, Length, LengthUnit, ParsedSpec } from '../domain/spec';
import { resolveDiameter, toMm } from '../parsing/units';
import {
  customerRequiredNote,
  discontinuedNote,
  explainAlternative,
  explainMatch,
  failedConstraintNote,
  formatDiameter,
  formatFinish,
  formatLength,
  formatMaterial,
  formatType,
  historyReferenceNote,
  overrideReason,
  tieBanner,
  unitMismatchNote,
  unknownDiameterNote,
  unknownTypeNote,
  unverifiedResidueNote,
  withPersonalization,
} from './explainer';

function diameter(nominal: string): Diameter {
  const resolved = resolveDiameter(nominal);
  if (resolved === undefined) throw new Error(`unresolvable diameter: ${nominal}`);
  return resolved;
}

function length(value: number, unit: LengthUnit): Length {
  return { value, unit, mm: toMm(value, unit) };
}

function spec(fields: Partial<ParsedSpec>): ParsedSpec {
  return { residue: [], evidence: {}, provenance: {}, ...fields };
}

// Descriptions and SKUs are read off data/catalog.csv, not from the design document.
const SHCS_716: CatalogItem = {
  catalogId: 'CAT-0375',
  sku: 'PXSOC716212STZC0375',
  description: '7/16-14 X 2-1/2" SOCKET HEAD CAP SCR DIN 933 STEEL ZINC',
  active: true,
  spec: spec({
    diameter: diameter('7/16'),
    pitch: '14',
    length: length(2.5, 'in'),
    type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'zinc', strength: 1 },
    standard: 'DIN 933',
  }),
};

const TAP_BOLT_34: CatalogItem = {
  catalogId: 'CAT-0384',
  sku: 'PXTAP3458STZC0384',
  description: '3/4-10 X 5/8" TAP BOLT ASME B18.2.1 STEEL ZINC',
  active: true,
  spec: spec({
    diameter: diameter('3/4'),
    pitch: '10',
    length: length(0.625, 'in'),
    type: [{ value: 'tap_bolt', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'zinc', strength: 1 },
    standard: 'ASME B18.2.1',
  }),
};

const WASHER_M8_18_8: CatalogItem = {
  catalogId: 'CAT-0688',
  sku: 'PXWASH88088PL0688',
  description: 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN',
  active: true,
  spec: spec({
    diameter: diameter('M8'),
    pitch: '1.25',
    type: [{ value: 'flat_washer', strength: 1 }],
    material: { value: 'ss_18_8', strength: 1 },
    finish: { value: 'plain', strength: 1 },
    standard: 'ISO 7380',
  }),
};

const WASHER_M8_DIN912: CatalogItem = {
  catalogId: 'CAT-0624',
  sku: 'PXWASH816A2BO0624',
  description: 'M8-1.25 FLAT WSHR DIN 912 A2 SS BLACK OXIDE',
  active: true,
  spec: spec({
    diameter: diameter('M8'),
    pitch: '1.25',
    type: [{ value: 'flat_washer', strength: 1 }],
    material: { value: 'ss_a2', strength: 1 },
    finish: { value: 'black_oxide', strength: 1 },
    standard: 'DIN 912',
  }),
};

const NUT_M8: CatalogItem = {
  catalogId: 'CAT-0617',
  sku: 'PXNUT840STZC0617',
  description: 'M8-1.25 HEX NUT STEEL ZINC',
  active: true,
  spec: spec({
    diameter: diameter('M8'),
    pitch: '1.25',
    type: [{ value: 'hex_nut', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'zinc', strength: 1 },
  }),
};

const NUT_M12: CatalogItem = {
  catalogId: 'CAT-0005',
  sku: 'PXNUT1216STZC0005',
  description: 'M12-1.75 HEX NUT CLASS 8 STEEL ZINC',
  active: true,
  spec: spec({
    diameter: diameter('M12'),
    pitch: '1.75',
    type: [{ value: 'hex_nut', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'zinc', strength: 1 },
    standard: 'CLASS 8',
  }),
};

const SOC_M8_30: CatalogItem = {
  catalogId: 'CAT-0004',
  sku: 'PXSOC830STBO0004',
  description: 'M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL BLACK OXIDE',
  active: true,
  spec: spec({
    diameter: diameter('M8'),
    pitch: '1.25',
    length: length(30, 'mm'),
    type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'black_oxide', strength: 1 },
  }),
};

const HEX_BRASS: CatalogItem = {
  catalogId: 'CAT-0072',
  sku: 'PXHEX384BRMZ0072',
  description: '3/8-16x4" HEX CAP SCREW IFI 111 BRASS MECH ZINC',
  active: true,
  spec: spec({
    diameter: diameter('3/8'),
    pitch: '16',
    length: length(4, 'in'),
    type: [{ value: 'hex_cap_screw', strength: 1 }],
    material: { value: 'brass', strength: 1 },
    finish: { value: 'mech_zinc', strength: 1 },
    standard: 'IFI 111',
  }),
};

const HEX_14_ZINC: CatalogItem = {
  catalogId: 'CAT-0003',
  sku: 'PXHEX1434STZC0003',
  description: '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC',
  active: true,
  spec: spec({
    diameter: diameter('1/4'),
    pitch: '20',
    length: length(0.75, 'in'),
    type: [{ value: 'hex_cap_screw', strength: 1 }],
    material: { value: 'steel', strength: 1 },
    finish: { value: 'zinc', strength: 1 },
  }),
};

const UNIQUE = { compatibleCount: 1, disambiguateBy: [] };

describe('formatDiameter', () => {
  it('names a metric diameter by its nominal alone', () => {
    expect(formatDiameter(diameter('M8'), '1.25')).toBe('M8');
  });

  it('joins an imperial nominal to its pitch', () => {
    expect(formatDiameter(diameter('1/2'), '13')).toBe('1/2-13');
  });

  it('joins a numbered nominal to its pitch', () => {
    expect(formatDiameter(diameter('#8'), '32')).toBe('#8-32');
  });

  it('falls back to the nominal when the pitch is unknown', () => {
    expect(formatDiameter(diameter('1/2'))).toBe('1/2');
  });
});

describe('formatLength', () => {
  it('prints millimetres with the unit', () => {
    expect(formatLength(length(45, 'mm'))).toBe('45 mm');
  });

  it('prints feet with the unit', () => {
    expect(formatLength(length(6, 'ft'))).toBe('6 ft');
  });

  it('prints a fractional inch as a fraction', () => {
    expect(formatLength(length(0.75, 'in'))).toBe('3/4"');
  });

  it('prints an inch over one as a mixed number', () => {
    expect(formatLength(length(2.5, 'in'))).toBe('2-1/2"');
  });

  it('prints a whole inch without a fraction', () => {
    expect(formatLength(length(2, 'in'))).toBe('2"');
  });

  it('reduces to the coarsest denominator', () => {
    expect(formatLength(length(0.625, 'in'))).toBe('5/8"');
  });

  it('falls back to the decimal when the value is not a sixteenth', () => {
    expect(formatLength(length(0.7, 'in'))).toBe('0.7"');
  });
});

describe('display names', () => {
  it('spells materials as the catalog does', () => {
    expect(formatMaterial('ss_18_8')).toBe('18-8 SS');
    expect(formatMaterial('ss_316')).toBe('316 SS');
    expect(formatMaterial('ss_a2')).toBe('A2 SS');
    expect(formatMaterial('stainless')).toBe('stainless');
  });

  it('expands the finish abbreviations a rep should not have to decode', () => {
    expect(formatFinish('hdg')).toBe('hot-dip galvanized');
    expect(formatFinish('black_oxide')).toBe('black oxide');
    expect(formatFinish('yellow_zinc')).toBe('yellow zinc');
    expect(formatFinish('zinc_family')).toBe('zinc');
  });

  it('spells every product type in English', () => {
    expect(formatType('socket_head_cap_screw')).toBe('socket head cap screw');
    expect(formatType('flat_washer')).toBe('flat washer');
    expect(formatType('tap_bolt')).toBe('tap bolt');
  });

  it('covers every domain value, so a new one cannot print as a raw key', () => {
    const materials: readonly (Material | MaterialFamily)[] = [...MATERIALS, ...MATERIAL_FAMILIES];
    const finishes: readonly (Finish | FinishFamily)[] = [...FINISHES, ...FINISH_FAMILIES];
    const types: readonly ProductType[] = PRODUCT_TYPES;

    for (const value of materials) expect(formatMaterial(value)).not.toMatch(/_/);
    for (const value of finishes) expect(formatFinish(value)).not.toMatch(/_/);
    for (const value of types) expect(formatType(value)).not.toMatch(/_/);
  });
});

describe('explainMatch', () => {
  it('explains an abbreviated, fully sized query (SHCS 7/16 x 2-1/2)', () => {
    const query = spec({
      diameter: diameter('7/16'),
      length: length(2.5, 'in'),
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
      evidence: { diameter: '7/16', length: '2-1/2', type: 'SHCS' },
      provenance: { diameter: 'explicit', length: 'explicit', type: 'explicit' },
    });

    expect(explainMatch(query, SHCS_716, UNIQUE)).toEqual({
      matched: [
        { attr: 'diameter', query: '7/16', item: '7/16-14', provenance: 'explicit' },
        { attr: 'length', query: '2-1/2', item: '2-1/2"', provenance: 'explicit' },
        { attr: 'type', query: 'SHCS', item: 'socket head cap screw', provenance: 'explicit' },
      ],
      unspecified: ['material', 'finish', 'standard'],
      unverified: [],
      compatibleCount: 1,
      disambiguateBy: [],
    });
  });

  it('marks a hex-head family term as partial (HHB 3/4-10 x 5/8)', () => {
    const query = spec({
      diameter: diameter('3/4'),
      pitch: '10',
      length: length(0.625, 'in'),
      type: [
        { value: 'hex_cap_screw', strength: 1 },
        { value: 'tap_bolt', strength: 1 },
      ],
      evidence: { diameter: '3/4-10', length: '5/8', type: 'HHB' },
      provenance: { diameter: 'explicit', length: 'explicit', type: 'explicit' },
    });

    expect(explainMatch(query, TAP_BOLT_34, UNIQUE).matched).toEqual([
      { attr: 'diameter', query: '3/4-10', item: '3/4-10', provenance: 'explicit' },
      { attr: 'length', query: '5/8', item: '5/8"', provenance: 'explicit' },
      { attr: 'type', query: 'HHB', item: 'tap bolt', provenance: 'explicit', partial: true },
    ]);
  });

  it('lists what would disambiguate a tie (M8 flat washer)', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
      evidence: { diameter: 'M8', type: 'flat washer' },
      provenance: { diameter: 'explicit', type: 'explicit' },
    });

    expect(
      explainMatch(query, WASHER_M8_18_8, {
        compatibleCount: 7,
        disambiguateBy: ['material', 'finish'],
      }),
    ).toEqual({
      matched: [
        { attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' },
        { attr: 'type', query: 'flat washer', item: 'flat washer', provenance: 'explicit' },
      ],
      unspecified: ['material', 'finish', 'standard'],
      unverified: [],
      compatibleCount: 7,
      disambiguateBy: ['material', 'finish'],
    });
  });

  it('never calls an attribute unspecified when the item has none either', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
    });

    expect(explainMatch(query, WASHER_M8_18_8, UNIQUE).unspecified).not.toContain('length');
  });

  it('marks a weak type term as partial and keeps residue verbatim (big brass bolt)', () => {
    const query = spec({
      type: [
        { value: 'hex_cap_screw', strength: 0.5 },
        { value: 'tap_bolt', strength: 0.5 },
        { value: 'lag_screw', strength: 0.4 },
      ],
      material: { value: 'brass', strength: 1 },
      residue: ['big'],
      evidence: { type: 'bolt', material: 'brass' },
      provenance: { type: 'explicit', material: 'explicit' },
    });

    expect(explainMatch(query, HEX_BRASS, { compatibleCount: 3, disambiguateBy: ['finish'] })).toEqual(
      {
        matched: [
          { attr: 'type', query: 'bolt', item: 'hex cap screw', provenance: 'explicit', partial: true },
          { attr: 'material', query: 'brass', item: 'brass', provenance: 'explicit' },
        ],
        unspecified: ['diameter', 'length', 'finish', 'standard'],
        unverified: ['big'],
        compatibleCount: 3,
        disambiguateBy: ['finish'],
      },
    );
  });

  it('preserves the original token text of every residue word', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'hex_nut', strength: 1 }],
      residue: ['nylon', 'insert'],
    });

    expect(explainMatch(query, NUT_M8, UNIQUE).unverified).toEqual(['nylon', 'insert']);
  });

  it('carries the provenance of an inferred diameter (12 millimeter hex nut)', () => {
    const query = spec({
      diameter: diameter('M12'),
      type: [{ value: 'hex_nut', strength: 1 }],
      evidence: { diameter: '12 millimeter', type: 'hex nut' },
      provenance: { diameter: 'inferred', type: 'explicit' },
    });

    expect(explainMatch(query, NUT_M12, UNIQUE).matched).toEqual([
      { attr: 'diameter', query: '12 millimeter', item: 'M12', provenance: 'inferred' },
      { attr: 'type', query: 'hex nut', item: 'hex nut', provenance: 'explicit' },
    ]);
  });

  it('shows the correction behind a typo (washr)', () => {
    const query = spec({
      type: [
        { value: 'flat_washer', strength: 0.6 },
        { value: 'lock_washer', strength: 0.6 },
      ],
      evidence: { type: 'washr' },
      provenance: { type: 'corrected' },
    });

    expect(explainMatch(query, WASHER_M8_18_8, { compatibleCount: 14, disambiguateBy: ['material'] })
      .matched).toEqual([
      { attr: 'type', query: 'washr', item: 'flat washer', provenance: 'corrected', partial: true },
    ]);
  });

  it('matches an explicit standard (M8 flat washer DIN 912)', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
      standard: 'DIN 912',
      evidence: { diameter: 'M8', type: 'flat washer', standard: 'DIN 912' },
      provenance: { diameter: 'explicit', type: 'explicit', standard: 'explicit' },
    });

    expect(explainMatch(query, WASHER_M8_DIN912, UNIQUE)).toEqual({
      matched: [
        { attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' },
        { attr: 'type', query: 'flat washer', item: 'flat washer', provenance: 'explicit' },
        { attr: 'standard', query: 'DIN 912', item: 'DIN 912', provenance: 'explicit' },
      ],
      unspecified: ['material', 'finish'],
      unverified: [],
      compatibleCount: 1,
      disambiguateBy: [],
    });
  });

  it('leaves nothing unspecified for a fully specified query', () => {
    const query = spec({
      diameter: diameter('1/4'),
      pitch: '20',
      length: length(0.75, 'in'),
      type: [{ value: 'hex_cap_screw', strength: 1 }],
      finish: { value: 'zinc', strength: 1 },
      evidence: { diameter: '1/4-20', length: '3/4', type: 'hex cap screw', finish: 'zinc' },
      provenance: {
        diameter: 'explicit',
        length: 'explicit',
        type: 'explicit',
        finish: 'explicit',
      },
    });

    expect(explainMatch(query, HEX_14_ZINC, UNIQUE)).toEqual({
      matched: [
        { attr: 'diameter', query: '1/4-20', item: '1/4-20', provenance: 'explicit' },
        { attr: 'length', query: '3/4', item: '3/4"', provenance: 'explicit' },
        { attr: 'type', query: 'hex cap screw', item: 'hex cap screw', provenance: 'explicit' },
        { attr: 'finish', query: 'zinc', item: 'zinc', provenance: 'explicit' },
      ],
      unspecified: ['material'],
      unverified: [],
      compatibleCount: 1,
      disambiguateBy: [],
    });
  });

  it('marks a family material as partial and names the item value', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
      material: { value: 'stainless', strength: 0.8 },
      evidence: { material: 'stainless' },
      provenance: { diameter: 'explicit', type: 'explicit', material: 'explicit' },
    });

    expect(explainMatch(query, WASHER_M8_18_8, UNIQUE).matched).toContainEqual({
      attr: 'material',
      query: 'stainless',
      item: '18-8 SS',
      provenance: 'explicit',
      partial: true,
    });
  });

  it('falls back to the formatted value when the parser recorded no evidence', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'hex_nut', strength: 1 }],
      provenance: { diameter: 'explicit', type: 'explicit' },
    });

    expect(explainMatch(query, NUT_M8, UNIQUE).matched).toEqual([
      { attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' },
      { attr: 'type', query: 'hex nut', item: 'hex nut', provenance: 'explicit' },
    ]);
  });
});

describe('explainAlternative', () => {
  const query = spec({
    diameter: diameter('M8'),
    length: length(45, 'mm'),
    type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    evidence: { diameter: 'M8', length: '45mm', type: 'SHCS' },
    provenance: { diameter: 'explicit', length: 'explicit', type: 'explicit' },
  });

  it('carries the relaxed constraint and the closeness (M8 x 45mm SHCS)', () => {
    expect(explainAlternative(query, SOC_M8_30, ['length'], 0.75)).toEqual({
      matched: [
        { attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' },
        { attr: 'type', query: 'SHCS', item: 'socket head cap screw', provenance: 'explicit' },
      ],
      unspecified: ['material', 'finish'],
      unverified: [],
      compatibleCount: 0,
      disambiguateBy: [],
      relaxed: ['length'],
      closeness: 0.75,
    });
  });

  it('never reports a relaxed attribute as matched or as unspecified', () => {
    const explanation = explainAlternative(query, SOC_M8_30, ['length'], 0.75);

    expect(explanation.matched.map((entry) => entry.attr)).not.toContain('length');
    expect(explanation.unspecified).not.toContain('length');
  });
});

describe('withPersonalization', () => {
  const base = explainMatch(
    spec({ diameter: diameter('M8'), type: [{ value: 'flat_washer', strength: 1 }] }),
    WASHER_M8_18_8,
    { compatibleCount: 7, disambiguateBy: ['material', 'finish'] },
  );

  it('attaches the personalization without mutating the explanation', () => {
    const personalized = withPersonalization(base, {
      reason: 'bought 2x, last 2026-04-15',
      prior: 0.42,
    });

    expect(personalized.personalization).toEqual({
      reason: 'bought 2x, last 2026-04-15',
      prior: 0.42,
    });
    expect(base.personalization).toBeUndefined();
  });

  it('keeps every other field of the explanation', () => {
    const personalized = withPersonalization(base, { reason: 'bought 2x', prior: 0.42 });

    expect(personalized.matched).toEqual(base.matched);
    expect(personalized.compatibleCount).toBe(7);
  });
});

describe('note builders', () => {
  it('names the constraint that emptied the compatible set', () => {
    const query = spec({
      diameter: diameter('M8'),
      length: length(45, 'mm'),
      type: [{ value: 'socket_head_cap_screw', strength: 1 }],
    });

    expect(failedConstraintNote(query, 'length')).toEqual({
      code: 'failedConstraint',
      message: 'no M8 socket head cap screw at 45 mm',
    });
  });

  it('names a failed standard with the standard', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
      standard: 'DIN 933',
    });

    expect(failedConstraintNote(query, 'standard').message).toBe('no M8 flat washer to DIN 933');
  });

  it('names a failed material with the material', () => {
    const query = spec({
      diameter: diameter('M8'),
      type: [{ value: 'flat_washer', strength: 1 }],
      material: { value: 'alloy', strength: 1 },
    });

    expect(failedConstraintNote(query, 'material').message).toBe('no M8 flat washer in alloy');
  });

  it('reports a diameter the catalog does not carry', () => {
    expect(unknownDiameterNote('M14')).toEqual({
      code: 'unknownDiameter',
      message: 'M14 is not a diameter in this catalog',
    });
  });

  it('reports a type the catalog does not carry', () => {
    expect(unknownTypeNote('carriage bolt')).toEqual({
      code: 'unknownType',
      message: 'carriage bolt is not a product type in this catalog',
    });
  });

  it('explains an inch length against a metric diameter (M8 x 3/4)', () => {
    expect(unitMismatchNote(diameter('M8'), length(0.75, 'in'))).toEqual({
      code: 'unitMismatch',
      message: 'length given in inches for a metric diameter; treated as 19.05 mm',
    });
  });

  it('explains the mismatch in the other direction too', () => {
    expect(unitMismatchNote(diameter('1/2'), length(30, 'mm')).message).toBe(
      'length given in millimetres for an imperial diameter; treated as 30 mm',
    );
  });

  it('explains a feet length against a metric diameter', () => {
    expect(unitMismatchNote(diameter('M8'), length(6, 'ft')).message).toBe(
      'length given in feet for a metric diameter; treated as 1828.8 mm',
    );
  });

  it('reports a discontinued repeat purchase', () => {
    expect(discontinuedNote('PXNUT16888PL0901')).toEqual({
      code: 'discontinued',
      message: 'previously ordered PXNUT16888PL0901 is discontinued; showing closest active',
    });
  });

  it('prompts for a customer, quoting the phrase it cannot resolve', () => {
    expect(customerRequiredNote('last time')).toEqual({
      code: 'customerRequired',
      message: "select a customer to resolve 'last time'",
    });
  });

  it('cites the order a history reference was based on', () => {
    expect(historyReferenceNote('2026-04-15', [])).toEqual({
      code: 'historyReference',
      message: 'based on your 2026-04-15 order',
    });
  });

  it('names what the query changed against that order', () => {
    expect(
      historyReferenceNote('2026-04-15', [{ attr: 'material', value: 'brass' }]).message,
    ).toBe('based on your 2026-04-15 order, material changed to brass');
  });

  it('joins two changes with and', () => {
    expect(
      historyReferenceNote('2026-04-15', [
        { attr: 'material', value: 'brass' },
        { attr: 'length', value: '50 mm' },
      ]).message,
    ).toBe('based on your 2026-04-15 order, material changed to brass and length changed to 50 mm');
  });

  it('lists the residue it could not verify', () => {
    expect(unverifiedResidueNote(['nylon'])).toEqual({
      code: 'unverifiedResidue',
      message: 'not verifiable: nylon',
    });
    expect(unverifiedResidueNote(['nylon', 'insert']).message).toBe('not verifiable: nylon, insert');
  });

  it('contains no template placeholder in any note', () => {
    const notes = [
      failedConstraintNote(
        spec({ diameter: diameter('M8'), type: [{ value: 'hex_nut', strength: 1 }] }),
        'length',
      ),
      unknownDiameterNote('M14'),
      unknownTypeNote('carriage bolt'),
      unitMismatchNote(diameter('M8'), length(0.75, 'in')),
      discontinuedNote('PXNUT16888PL0901'),
      customerRequiredNote('last time'),
      historyReferenceNote('2026-04-15', [{ attr: 'material', value: 'brass' }]),
      unverifiedResidueNote(['nylon']),
    ];

    for (const note of notes) {
      expect(note.message).not.toMatch(/undefined|\[object|\$\{|_/);
      expect(note.message.trim()).toBe(note.message);
    }
  });
});

describe('banner and override strings', () => {
  it('states the tie and what would settle it', () => {
    expect(tieBanner(7, ['material', 'finish'])).toBe(
      '7 compatible options, specify material or finish',
    );
  });

  it('asks for a single attribute without a list', () => {
    expect(tieBanner(3, ['finish'])).toBe('3 compatible options, specify finish');
  });

  it('separates three attributes with commas and a final or', () => {
    expect(tieBanner(9, ['material', 'finish', 'standard'])).toBe(
      '9 compatible options, specify material, finish or standard',
    );
  });

  it('states the count alone when nothing varies', () => {
    expect(tieBanner(2, [])).toBe('2 compatible options');
  });

  it('says what history wanted and that the query won', () => {
    expect(overrideReason(['alloy', 'black oxide'])).toBe(
      'history prefers alloy black oxide; overridden by the query',
    );
  });
});
