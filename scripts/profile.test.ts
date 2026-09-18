import { describe, expect, it } from 'vitest';

import {
  caseForm,
  dedupeBySku,
  parseCsv,
  toCatalogRows,
  whitespaceIssues,
  type CatalogRow,
} from './profile';

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
