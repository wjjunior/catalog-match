import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvCatalogRepository } from '../adapters/csv/csvCatalogRepository';
import type { Finish, Material, ProductType } from '../domain/attributes';
import type { CatalogItem } from '../domain/catalog';
import { descriptionParser } from './descriptionParser';

/** docs/DESIGN.md 3.1 calls the SKU encoding a test oracle and never a data source, so
 * these tables live here and are never imported by the parser. */
const SKU =
  /^PX(HEX|SOC|BTN|PAN|LAG|TAP|ROD|NUT|WASH|LOCK)(N?\d+)(ST|88|36|A2|BR|AL)(ZC|YZ|MZ|HG|PL|BO)(\d{4})$/;

const ENCODED_TYPE: Readonly<Record<string, ProductType>> = {
  HEX: 'hex_cap_screw',
  SOC: 'socket_head_cap_screw',
  BTN: 'button_socket_cap_screw',
  PAN: 'pan_machine_screw',
  LAG: 'lag_screw',
  TAP: 'tap_bolt',
  ROD: 'threaded_rod',
  NUT: 'hex_nut',
  WASH: 'flat_washer',
  LOCK: 'lock_washer',
};

const ENCODED_MATERIAL: Readonly<Record<string, Material>> = {
  ST: 'steel',
  '88': 'ss_18_8',
  '36': 'ss_316',
  A2: 'ss_a2',
  BR: 'brass',
  AL: 'alloy',
};

const ENCODED_FINISH: Readonly<Record<string, Finish>> = {
  ZC: 'zinc',
  YZ: 'yellow_zinc',
  MZ: 'mech_zinc',
  HG: 'hdg',
  PL: 'plain',
  BO: 'black_oxide',
};

const LENGTH_BEARING: ReadonlySet<ProductType> = new Set<ProductType>([
  'hex_cap_screw',
  'socket_head_cap_screw',
  'button_socket_cap_screw',
  'pan_machine_screw',
  'lag_screw',
  'tap_bolt',
  'threaded_rod',
]);

const catalogPath = fileURLToPath(new URL('../../../../data/catalog.csv', import.meta.url));
const catalog = CsvCatalogRepository.load(catalogPath, descriptionParser);
const items = catalog.all();

interface Encoded {
  type: ProductType;
  material: Material;
  finish: Finish;
}

function decode(sku: string): Encoded | undefined {
  const parts = SKU.exec(sku);
  if (parts === null) return undefined;

  const [, type = '', , material = '', finish = ''] = parts;
  const encoded = {
    type: ENCODED_TYPE[type],
    material: ENCODED_MATERIAL[material],
    finish: ENCODED_FINISH[finish],
  };

  return encoded.type && encoded.material && encoded.finish
    ? { type: encoded.type, material: encoded.material, finish: encoded.finish }
    : undefined;
}

const soleType = (item: CatalogItem): ProductType | undefined =>
  item.spec.type?.length === 1 ? item.spec.type[0]?.value : undefined;

describe('loading the real catalog through the repository', () => {
  it('parses every unique SKU without throwing', () => {
    expect(items).toHaveLength(960);
  });

  it('populates diameter, type, material and finish on every row', () => {
    const incomplete = items.filter(
      (item) =>
        item.spec.diameter === undefined ||
        item.spec.type === undefined ||
        item.spec.material === undefined ||
        item.spec.finish === undefined,
    );

    expect(incomplete).toEqual([]);
  });

  it('reads a diameter the catalog knows on every row', () => {
    expect(items.filter((item) => item.spec.diameter?.known !== true)).toEqual([]);
  });

  it('understands every token of every row', () => {
    expect(items.filter((item) => item.spec.residue.length > 0)).toEqual([]);
  });

  it('names a single type on every row', () => {
    expect(items.filter((item) => soleType(item) === undefined)).toEqual([]);
  });
});

describe('the SKU encoding as oracle', () => {
  it('decodes every SKU', () => {
    expect(items.filter((item) => decode(item.sku) === undefined)).toEqual([]);
  });

  it('agrees with the parsed type, material and finish on every row', () => {
    const disagreeing = items.filter((item) => {
      const encoded = decode(item.sku);
      return (
        encoded === undefined ||
        encoded.type !== soleType(item) ||
        encoded.material !== item.spec.material?.value ||
        encoded.finish !== item.spec.finish?.value
      );
    });

    expect(disagreeing.map((item) => item.description)).toEqual([]);
  });
});

describe('length by type', () => {
  it('is present on every screw, bolt and rod', () => {
    const missing = items.filter(
      (item) => LENGTH_BEARING.has(soleType(item)!) && item.spec.length === undefined,
    );

    expect(missing.map((item) => item.description)).toEqual([]);
    expect(items.filter((item) => item.spec.length !== undefined)).toHaveLength(682);
  });

  it('is absent on every nut and washer', () => {
    const unexpected = items.filter(
      (item) => !LENGTH_BEARING.has(soleType(item)!) && item.spec.length !== undefined,
    );

    expect(unexpected.map((item) => item.description)).toEqual([]);
    expect(items.filter((item) => item.spec.length === undefined)).toHaveLength(278);
  });
});

describe('uniqueness of the parsed tuple', () => {
  const key = (item: CatalogItem): string =>
    [
      item.spec.diameter?.nominal,
      item.spec.length?.mm ?? '-',
      soleType(item),
      item.spec.material?.value,
      item.spec.finish?.value,
    ].join('|');

  it('identifies every SKU once the standard is included', () => {
    const keys = new Set(items.map((item) => `${key(item)}|${item.spec.standard ?? '-'}`));

    expect(keys.size).toBe(960);
  });

  // docs/DESIGN.md 3.1 and the PRG-16 card both say 10 collisions and 950 distinct. The
  // data has 11, each a nut or washer pair separated only by its standard.
  it('leaves eleven pairs colliding once the standard is dropped', () => {
    expect(new Set(items.map(key)).size).toBe(949);
  });
});
