import { describe, expect, it } from 'vitest';

import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('maps each row onto the header', () => {
    const rows = parseCsv('a,b\n1,2\n3,4\n');

    expect(rows).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' },
    ]);
  });

  it('keeps a comma that sits inside a quoted field', () => {
    const rows = parseCsv('sku,description\nX,"bolt, hex"\n');

    expect(rows[0]?.description).toBe('bolt, hex');
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    const rows = parseCsv('sku,description\nX,"1/4-20 X 3/4"" HEX CAP SCREW STEEL ZINC"\n');

    expect(rows[0]?.description).toBe('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');
  });

  it('keeps a newline that sits inside a quoted field', () => {
    const rows = parseCsv('a,b\n"one\ntwo",3\n');

    expect(rows).toEqual([{ a: 'one\ntwo', b: '3' }]);
  });

  it('reads CRLF line endings', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n');

    expect(rows).toEqual([{ a: '1', b: '2' }]);
  });

  it('does not emit a row for a trailing newline', () => {
    expect(parseCsv('a\n1\n')).toHaveLength(1);
    expect(parseCsv('a\n1')).toHaveLength(1);
  });

  it('returns no rows for a header-only file', () => {
    expect(parseCsv('a,b\n')).toEqual([]);
  });

  it('keeps an empty field empty', () => {
    expect(parseCsv('a,b,c\n1,,3\n')).toEqual([{ a: '1', b: '', c: '3' }]);
  });

  it('preserves the case of the source text', () => {
    const rows = parseCsv('sku,description\nX,5/16 flat washer steel plain\n');

    expect(rows[0]?.description).toBe('5/16 flat washer steel plain');
  });
});
