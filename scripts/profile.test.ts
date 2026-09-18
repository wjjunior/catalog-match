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

import { catalogStats, skuTypeCode } from './profile';

describe('catalogStats', () => {
  const stats = catalogStats(toCatalogRows(parseCsv(catalogFixture)));

  it('anchors the SKU type code instead of taking every leading letter', () => {
    expect(skuTypeCode('PXWASH8A2BO0004')).toBe('WASH');
    expect(skuTypeCode('PXNUT1216STZC0003')).toBe('NUT');
    expect(skuTypeCode('PXLOCK12STZC0009')).toBe('LOCK');
  });

  it('counts rows on the raw basis and SKUs on the deduped one', () => {
    expect(stats.rawRows).toBe(5);
    expect(stats.uniqueSkus).toBe(4);
    expect(stats.duplicateRows).toBe(1);
    expect(stats.inactiveRows).toBe(1);
    expect(stats.inactiveSkus).toBe(1);
  });

  it('counts fully lowercase descriptions on the raw basis, apart from mixed case', () => {
    expect(stats.lowercaseAllRaw).toBe(1);
    expect(stats.lowercaseAnyRaw).toBe(1);
  });

  it('records a type phrase variant per type and a length presence per type', () => {
    expect(stats.typePhrasesByType.get('NUT')?.get('HEX NUT')).toBe(1);
    expect(stats.lengthPresenceByType.get('NUT')).toEqual({ withLength: 0, withoutLength: 1 });
    expect(stats.lengthPresenceByType.get('HEX')).toEqual({ withLength: 1, withoutLength: 0 });
  });

  it('counts length groups only over rows that carry a length', () => {
    expect(stats.lengthGroups).toBe(2);
    expect(stats.lengthGroupsUnique).toBe(2);
  });

  it('reports repeated whitespace and the separator forms seen', () => {
    expect(stats.whitespaceIrregular).toBe(1);
    expect(stats.separatorForms.get(' X ')).toBe(2);
  });
});

import { historyStats, toHistoryRows } from './profile';

const historyFixture = [
  'customer_id,customer_name,order_date,sku,catalog_description,quantity',
  'CUST-001,Acme,2025-08-12,PXHEX1434STZC0001,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC",10',
  'CUST-001,Acme,2025-08-12,PXROD126STZC0005,1/2-13 X 6FT THREADED ROD STEEL ZINC,5',
  'CUST-001,Acme,2025-09-03,PXHEX1434STZC0001,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC",20',
  'CUST-002,Beta,2026-01-15,PXNUT1216STZC0003,M12-1.75 HEX NUT STEEL ZINC,7',
  'CUST-002,Beta,2026-01-15,PXGONE0000STZC9999,NOT IN THE CATALOG STEEL ZINC,1',
].join('\n');

describe('historyStats', () => {
  const stats = historyStats(
    toHistoryRows(parseCsv(historyFixture)),
    toCatalogRows(parseCsv(catalogFixture)),
  );

  it('counts lines, customers and the date range', () => {
    expect(stats.lines).toBe(5);
    expect(stats.customers).toBe(2);
    expect(stats.firstDate).toBe('2025-08-12');
    expect(stats.lastDate).toBe('2026-01-15');
  });

  it('counts an order as a distinct date and a repeat SKU as one bought twice', () => {
    expect(stats.byCustomer[0]?.lines).toBe(3);
    expect(stats.byCustomer[0]?.orders).toBe(2);
    expect(stats.byCustomer[0]?.repeatSkus).toBe(1);
  });

  it('names the SKUs missing from the catalog and the inactive ones purchased', () => {
    expect(stats.skusMissingFromCatalog).toEqual(['PXGONE0000STZC9999']);
    expect(stats.inactiveSkusPurchased).toEqual(['PXNUT1216STZC0003']);
  });

  it('shares material and finish, and the metric share, over a customer lines', () => {
    expect(stats.byCustomer[0]?.materialShares.get('STEEL')).toBe(3);
    expect(stats.byCustomer[0]?.metricShare).toBe(0);
    expect(stats.byCustomer[1]?.metricShare).toBe(0.5);
  });
});
