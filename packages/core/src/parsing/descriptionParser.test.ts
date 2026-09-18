import { describe, expect, it } from 'vitest';

import { DescriptionParseError, descriptionParser, parseDescription } from './descriptionParser';

describe('the canonical grammar', () => {
  const spec = parseDescription('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');

  it('reads the diameter from the first token', () => {
    expect(spec.diameter).toEqual({
      system: 'imperial',
      nominal: '1/4',
      mm: 6.35,
      known: true,
    });
  });

  it('keeps the pitch beside the diameter', () => {
    expect(spec.pitch).toBe('20');
  });

  it('reads the length from the token after the separator', () => {
    expect(spec.length).toEqual({ value: 0.75, unit: 'in', mm: 19.05 });
  });

  it('reads the type at full strength', () => {
    expect(spec.type).toEqual([{ value: 'hex_cap_screw', strength: 1 }]);
  });

  it('reads the material and the finish', () => {
    expect(spec.material).toEqual({ value: 'steel', strength: 1 });
    expect(spec.finish).toEqual({ value: 'zinc', strength: 1 });
  });

  it('leaves the standard unset when the row states none', () => {
    expect(spec.standard).toBeUndefined();
  });

  it('understands every token', () => {
    expect(spec.residue).toEqual([]);
  });
});

describe('length variants', () => {
  it('infers inches for a mixed number written without the inch mark', () => {
    const spec = parseDescription('3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG');

    expect(spec.length).toEqual({ value: 1.5, unit: 'in', mm: 38.1 });
    expect(spec.provenance.length).toBe('inferred');
  });

  it('reads feet', () => {
    const spec = parseDescription('1/2-13 X 6FT FULL THREAD ROD STEEL ZINC');

    expect(spec.length).toEqual({ value: 6, unit: 'ft', mm: 1828.8 });
    expect(spec.type).toEqual([{ value: 'threaded_rod', strength: 1 }]);
  });

  it('reads millimetres', () => {
    const spec = parseDescription('M4-0.7 X 60MM HEX CAP SCR DIN 912 STEEL YEL ZINC');

    expect(spec.length).toEqual({ value: 60, unit: 'mm', mm: 60 });
    expect(spec.provenance.length).toBe('explicit');
  });

  it('leaves the length unset on a type that carries none', () => {
    const spec = parseDescription('M16-2.0 HEX NUT STEEL ZINC');

    expect(spec.length).toBeUndefined();
    expect(spec.type).toEqual([{ value: 'hex_nut', strength: 1 }]);
  });
});

describe('diameter variants', () => {
  it('reads a numbered diameter', () => {
    const spec = parseDescription('#8-32 FLAT WSHR ASME B18.2.1 BRASS PLAIN');

    expect(spec.diameter).toEqual({ system: 'number', nominal: '#8', mm: 4.1656, known: true });
    expect(spec.standard).toBe('ASME B18.2.1');
  });

  it('reads a metric diameter', () => {
    const spec = parseDescription('m8-1.25 x 60mm soc head cap screw iso 7380 steel zinc');

    expect(spec.diameter).toEqual({ system: 'metric', nominal: 'M8', mm: 8, known: true });
    expect(spec.pitch).toBe('1.25');
    expect(spec.type).toEqual([{ value: 'socket_head_cap_screw', strength: 1 }]);
  });

  it('accepts a row that states no pitch', () => {
    const spec = parseDescription('5/16 FLAT WASHER STEEL PLAIN');

    expect(spec.diameter).toEqual({ system: 'imperial', nominal: '5/16', mm: 7.9375, known: true });
    expect(spec.pitch).toBeUndefined();
    expect(spec.type).toEqual([{ value: 'flat_washer', strength: 1 }]);
  });

  // docs/DESIGN.md 5.2: an unknown nominal must reach the null hypothesis as a real size.
  it('keeps a diameter that is not one of the sixteen, marked unknown', () => {
    const spec = parseDescription('M14-2.0 HEX CAP SCREW STEEL ZINC');

    expect(spec.diameter).toEqual({ system: 'metric', nominal: 'M14', mm: 14, known: false });
  });
});

describe('the noise the catalog actually contains', () => {
  it('splits a separator glued to both sides', () => {
    const spec = parseDescription('5/8-11x2-1/2" BTN SOC CAP SCREW DIN 933 A2 SS YEL ZINC');

    expect(spec.diameter?.nominal).toBe('5/8');
    expect(spec.length).toEqual({ value: 2.5, unit: 'in', mm: 63.5 });
    expect(spec.type).toEqual([{ value: 'button_socket_cap_screw', strength: 1 }]);
    expect(spec.standard).toBe('DIN 933');
    expect(spec.material).toEqual({ value: 'ss_a2', strength: 1 });
    expect(spec.finish).toEqual({ value: 'yellow_zinc', strength: 1 });
  });

  it('reads a fully lowercase row', () => {
    const spec = parseDescription('m12-1.75 x 12mm lag screw brass yellow zn');

    expect(spec.type).toEqual([{ value: 'lag_screw', strength: 1 }]);
    expect(spec.material).toEqual({ value: 'brass', strength: 1 });
    expect(spec.finish).toEqual({ value: 'yellow_zinc', strength: 1 });
  });

  it('reads the abbreviated spellings', () => {
    const spec = parseDescription('3/4-10X 3" PHIL PAN MACH SCR ASTM A307 18-8 SS BLK OXIDE');

    expect(spec.length).toEqual({ value: 3, unit: 'in', mm: 76.2 });
    expect(spec.type).toEqual([{ value: 'pan_machine_screw', strength: 1 }]);
    expect(spec.material).toEqual({ value: 'ss_18_8', strength: 1 });
    expect(spec.finish).toEqual({ value: 'black_oxide', strength: 1 });
  });
});

describe('evidence and provenance', () => {
  const spec = parseDescription('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');

  it('quotes the description as written', () => {
    expect(spec.evidence).toEqual({
      diameter: '1/4-20',
      length: '3/4"',
      type: 'HEX CAP SCREW',
      material: 'STEEL',
      finish: 'ZINC',
    });
  });

  it('records every stated attribute as explicit', () => {
    expect(spec.provenance).toEqual({
      diameter: 'explicit',
      length: 'explicit',
      type: 'explicit',
      material: 'explicit',
      finish: 'explicit',
    });
  });
});

describe('a row it cannot read', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['diameter', 'HEX CAP SCREW STEEL ZINC'],
    ['type', '1/4-20 X 3/4" STEEL ZINC'],
    ['material', '1/4-20 X 3/4" HEX CAP SCREW ZINC'],
    ['finish', '1/4-20 X 3/4" HEX CAP SCREW STEEL'],
  ];

  for (const [attribute, description] of cases) {
    it(`throws when the ${attribute} is missing`, () => {
      expect(() => parseDescription(description)).toThrow(DescriptionParseError);
      expect(() => parseDescription(description)).toThrow(attribute);
    });
  }

  it('carries the row and the attribute on the error', () => {
    try {
      parseDescription('HEX CAP SCREW STEEL ZINC');
      expect.unreachable('the row has no diameter');
    } catch (error) {
      expect(error).toBeInstanceOf(DescriptionParseError);
      expect((error as DescriptionParseError).description).toBe('HEX CAP SCREW STEEL ZINC');
      expect((error as DescriptionParseError).attribute).toBe('diameter');
    }
  });

  it('throws when the separator is followed by something that is not a length', () => {
    expect(() => parseDescription('1/4-20 X HEX CAP SCREW STEEL ZINC')).toThrow(
      DescriptionParseError,
    );
  });
});

describe('the DescriptionParser the repository is given', () => {
  it('parses through the contract', () => {
    expect(descriptionParser.parse('M16-2.0 HEX NUT STEEL ZINC').type).toEqual([
      { value: 'hex_nut', strength: 1 },
    ]);
  });
});
