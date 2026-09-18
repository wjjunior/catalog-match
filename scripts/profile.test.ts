import { describe, expect, it } from 'vitest';

import {
  caseForm,
  dedupeBySku,
  parseCsv,
  toCatalogRows,
  whitespaceIssues,
  type CatalogRow,
} from './profile';
import { parseDescription, separatorForm, splitOnMaterial, normalize } from './profile';

const catalogFixture = [
  'catalog_id,sku,catalog_description,active',
  'CAT-0001,PXHEX1434STZC0001,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC",Y',
  'CAT-0002,PXHEX1434STZC0001,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC",Y',
  'CAT-0003,PXNUT1216STZC0003,M12-1.75 HEX NUT STEEL ZINC,N',
  'CAT-0004,PXWASH8A2BO0004,m8 flat washer a2 ss black oxide,Y',
  'CAT-0005,PXROD126STZC0005,1/2-13 X 6FT THREADED ROD STEEL  ZINC,Y',
].join('\n');

describe('parseCsv', () => {
  it('keeps a doubled quote inside a quoted field', () => {
    const text = 'sku,catalog_description\nA,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC"\n';

    expect(parseCsv(text)).toEqual([
      { sku: 'A', catalog_description: '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC' },
    ]);
  });

  it('keeps a comma inside a quoted field and tolerates a missing final newline', () => {
    const text = 'a,b\n"x,y",z';

    expect(parseCsv(text)).toEqual([{ a: 'x,y', b: 'z' }]);
  });
});

describe('loading and dedupe', () => {
  it('reads the four catalog columns and the active flag', () => {
    const rows = toCatalogRows(parseCsv(catalogFixture));

    expect(rows).toHaveLength(5);
    expect(rows[0]?.catalogId).toBe('CAT-0001');
    expect(rows[2]?.active).toBe(false);
  });

  it('keeps the first catalog_id for a repeated SKU', () => {
    const deduped = dedupeBySku(toCatalogRows(parseCsv(catalogFixture)));

    expect(deduped).toHaveLength(4);
    expect(deduped.map((row: CatalogRow) => row.catalogId)).not.toContain('CAT-0002');
  });

  it('separates a fully lowercase description from a mixed one', () => {
    expect(caseForm('m8 flat washer a2 ss black oxide')).toBe('all-lower');
    expect(caseForm('1/2-13 x 6FT THREADED ROD STEEL ZINC')).toBe('mixed');
    expect(caseForm('M12-1.75 HEX NUT STEEL ZINC')).toBe('all-upper');
  });

  it('reports repeated and surrounding whitespace', () => {
    expect(whitespaceIssues('1/2-13 X 6FT THREADED ROD STEEL  ZINC')).toEqual(['repeated']);
    expect(whitespaceIssues(' M12 HEX NUT STEEL ZINC')).toEqual(['surrounding']);
    expect(whitespaceIssues('M12 HEX NUT STEEL ZINC')).toEqual([]);
  });
});

describe('parseDescription', () => {
  it('splits on the material and reads the finish behind it', () => {
    const split = splitOnMaterial(normalize('1/4-20 X 3/4" HEX CAP SCREW 18-8 SS YEL ZN'));

    expect(split?.material).toBe('18-8 SS');
    expect(split?.finishSurface).toBe('YEL ZN');
    expect(split?.head).toBe('1/4-20 X 3/4" HEX CAP SCREW');
  });

  it('canonicalises an abbreviated finish onto its written-out twin', () => {
    const abbreviated = parseDescription('M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL YEL ZN');
    const spelled = parseDescription('M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL YELLOW ZINC');

    expect(abbreviated?.finish).toBe('YELLOW ZINC');
    expect(spelled?.finish).toBe('YELLOW ZINC');
    expect(abbreviated?.finishSurface).toBe('YEL ZN');
  });

  it('reads an imperial diameter, its TPI, a fractional length and the inch mark', () => {
    const parsed = parseDescription('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');

    expect(parsed).toMatchObject({
      diameter: '1/4',
      pitch: '20',
      length: '3/4',
      lengthUnit: '"',
      typePhrase: 'HEX CAP SCREW',
      standard: null,
      material: 'STEEL',
      finish: 'ZINC',
    });
  });

  it('reads a metric diameter with a millimetre length and a mixed-number imperial length', () => {
    expect(parseDescription('M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL PLN')).toMatchObject({
      diameter: 'M8',
      pitch: '1.25',
      length: '30',
      lengthUnit: 'MM',
    });
    expect(parseDescription('5/8-11X2-1/2" BTN SOC CAP SCREW A2 SS ZN')).toMatchObject({
      diameter: '5/8',
      length: '2-1/2',
      lengthUnit: '"',
    });
  });

  it('records an absent inch mark as an empty unit rather than as an absent length', () => {
    expect(parseDescription('3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG')).toMatchObject({
      length: '1-1/2',
      lengthUnit: '',
    });
  });

  it('leaves the length null on a nut, which never carries one', () => {
    expect(parseDescription('M12-1.75 HEX NUT STEEL ZINC')).toMatchObject({
      length: null,
      lengthUnit: null,
      typePhrase: 'HEX NUT',
    });
  });

  it('reads a numbered diameter and a trailing standard', () => {
    expect(parseDescription('#8-32 FLAT WSHR ASME B18.2.1 BRASS PLAIN')).toMatchObject({
      diameter: '#8',
      pitch: '32',
      typePhrase: 'FLAT WSHR',
      standard: 'ASME B18.2.1',
    });
  });

  it('does not mistake the CLASS 8 of a hex nut phrase for a standard', () => {
    expect(parseDescription('M12-1.75 HEX NUT CLASS 8 STEEL ZINC')).toMatchObject({
      typePhrase: 'HEX NUT CLASS 8',
      standard: null,
    });
  });

  it('reads the separator from the raw description, ignoring the X of BLACK OXIDE', () => {
    expect(separatorForm('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC')).toBe(' X ');
    expect(separatorForm('5/8-11x2-1/2" BTN SOC CAP SCREW A2 SS BLACK OXIDE')).toBe('x');
    expect(separatorForm('M12-1.75 HEX NUT STEEL BLACK OXIDE')).toBe(null);
  });
});
