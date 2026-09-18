import { describe, expect, it } from 'vitest';

import { ITEMS } from '../../test/fixtures/items';

describe('fixtures', () => {
  it('holds seven active M8 flat washers and one discontinued', () => {
    const washers = ITEMS.filter(
      (i) => i.spec.diameter?.nominal === 'M8' && i.spec.type?.[0]?.value === 'flat_washer',
    );
    expect(washers.filter((i) => i.active)).toHaveLength(7);
    expect(washers.filter((i) => !i.active).map((i) => i.catalogId)).toEqual(['CAT-0619']);
  });

  it('holds the eight distinct M8 socket head cap screws', () => {
    const screws = ITEMS.filter(
      (i) =>
        i.spec.diameter?.nominal === 'M8' && i.spec.type?.[0]?.value === 'socket_head_cap_screw',
    );
    expect(screws).toHaveLength(8);
    expect(new Set(screws.map((i) => i.sku)).size).toBe(8);
  });

  it('has no M14 item, because its absence is what M14 queries test', () => {
    expect(ITEMS.some((i) => i.spec.diameter?.nominal === 'M14')).toBe(false);
  });

  it('gives every item a unique SKU, as the repository does at load', () => {
    expect(new Set(ITEMS.map((i) => i.sku)).size).toBe(ITEMS.length);
  });
});
