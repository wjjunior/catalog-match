import { describe, expect, it } from 'vitest';

import { parseCsv } from './profile';

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
