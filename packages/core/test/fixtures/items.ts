import type { Finish, Material, ProductType } from '../../src/domain/attributes';
import type { CatalogItem } from '../../src/domain/catalog';
import { DIAMETERS } from '../../src/domain/diameters';
import type { LengthUnit, ParsedSpec } from '../../src/domain/spec';

const MM_PER_UNIT: Readonly<Record<LengthUnit, number>> = { mm: 1, in: 25.4, ft: 304.8 };

interface Seed {
  catalogId: string;
  sku: string;
  description: string;
  diameter: string;
  type: ProductType;
  material: Material;
  finish: Finish;
  standard?: string;
  length?: readonly [number, LengthUnit];
  active?: boolean;
}

function toItem(seed: Seed): CatalogItem {
  const d = DIAMETERS.find((entry) => entry.nominal === seed.diameter);
  if (!d) throw new Error(`fixture uses an unknown diameter: ${seed.diameter}`);

  const spec: ParsedSpec = {
    diameter: { system: d.system, nominal: d.nominal, mm: d.mm, known: true },
    pitch: d.pitch,
    type: [{ value: seed.type, strength: 1 }],
    material: { value: seed.material, strength: 1 },
    finish: { value: seed.finish, strength: 1 },
    ...(seed.standard === undefined ? {} : { standard: seed.standard }),
    ...(seed.length === undefined
      ? {}
      : {
          length: {
            value: seed.length[0],
            unit: seed.length[1],
            mm: seed.length[0] * MM_PER_UNIT[seed.length[1]],
          },
        }),
    residue: [],
    evidence: {},
    provenance: {},
  };

  return {
    catalogId: seed.catalogId,
    sku: seed.sku,
    description: seed.description,
    active: seed.active ?? true,
    spec,
  };
}

const SEEDS: readonly Seed[] = [
  // M8 flat washers: seven active, one discontinued.
  { catalogId: 'CAT-0009', sku: 'PXWASH825STYZ0009', description: 'M8-1.25 FLAT WASHER STEEL YELLOW ZINC', diameter: 'M8', type: 'flat_washer', material: 'steel', finish: 'yellow_zinc' },
  { catalogId: 'CAT-0016', sku: 'PXWASH812A2YZ0016', description: 'M8-1.25 FLAT WASHER IFI 111 A2 SS YELLOW ZN', diameter: 'M8', type: 'flat_washer', material: 'ss_a2', finish: 'yellow_zinc', standard: 'IFI 111' },
  { catalogId: 'CAT-0440', sku: 'PXWASH850BRPL0440', description: 'M8-1.25 FLAT WSHR DIN 933 BRASS PLAIN', diameter: 'M8', type: 'flat_washer', material: 'brass', finish: 'plain', standard: 'DIN 933' },
  { catalogId: 'CAT-0520', sku: 'PXWASH830BRZC0520', description: 'M8-1.25 FLAT WASHER DIN 933 BRASS ZN', diameter: 'M8', type: 'flat_washer', material: 'brass', finish: 'zinc', standard: 'DIN 933' },
  { catalogId: 'CAT-0624', sku: 'PXWASH816A2BO0624', description: 'M8-1.25 FLAT WSHR DIN 912 A2 SS BLACK OXIDE', diameter: 'M8', type: 'flat_washer', material: 'ss_a2', finish: 'black_oxide', standard: 'DIN 912' },
  { catalogId: 'CAT-0688', sku: 'PXWASH88088PL0688', description: 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN', diameter: 'M8', type: 'flat_washer', material: 'ss_18_8', finish: 'plain', standard: 'ISO 7380' },
  { catalogId: 'CAT-0974', sku: 'PXWASH82536HG0974', description: 'M8-1.25 FLAT WSHR ASTM A307 316 SS HDG', diameter: 'M8', type: 'flat_washer', material: 'ss_316', finish: 'hdg', standard: 'ASTM A307' },
  { catalogId: 'CAT-0619', sku: 'PXWASH88BRBO0619', description: 'M8-1.25 FLAT WASHER ASME B18.2.1 BRASS BLACK OXIDE', diameter: 'M8', type: 'flat_washer', material: 'brass', finish: 'black_oxide', standard: 'ASME B18.2.1', active: false },

  // M8 socket head cap screws: the eight distinct SKUs of DESIGN 5.6.
  { catalogId: 'CAT-0759', sku: 'PXSOC88A2ZC0759', description: 'M8-1.25 X 8MM SOCKET HEAD CAP SCREW ISO 7380 A2 SS ZINC', diameter: 'M8', type: 'socket_head_cap_screw', material: 'ss_a2', finish: 'zinc', standard: 'ISO 7380', length: [8, 'mm'] },
  { catalogId: 'CAT-0291', sku: 'PXSOC81636HG0291', description: 'M8-1.25 X 16MM SOCKET HEAD CAP SCR ASTM A307 316 SS HDG', diameter: 'M8', type: 'socket_head_cap_screw', material: 'ss_316', finish: 'hdg', standard: 'ASTM A307', length: [16, 'mm'] },
  { catalogId: 'CAT-0975', sku: 'PXSOC816STZC0975', description: 'M8-1.25x16MM SOCKET HEAD CAP SCREW ISO 7380 STEEL ZINC', diameter: 'M8', type: 'socket_head_cap_screw', material: 'steel', finish: 'zinc', standard: 'ISO 7380', length: [16, 'mm'] },
  { catalogId: 'CAT-0888', sku: 'PXSOC820ALBO0888', description: 'M8-1.25 X 20MM SOCKET HEAD CAP SCREW ASME B18.2.1 ALLOY BLACK OXIDE', diameter: 'M8', type: 'socket_head_cap_screw', material: 'alloy', finish: 'black_oxide', standard: 'ASME B18.2.1', length: [20, 'mm'] },
  { catalogId: 'CAT-0097', sku: 'PXSOC825A2PL0097', description: 'M8-1.25 X 25MM SOC HEAD CAP SCREW ASTM A307 A2 SS PLAIN', diameter: 'M8', type: 'socket_head_cap_screw', material: 'ss_a2', finish: 'plain', standard: 'ASTM A307', length: [25, 'mm'] },
  { catalogId: 'CAT-0004', sku: 'PXSOC830STBO0004', description: 'M8-1.25 X 30MM SOCKET HEAD CAP SCR STEEL BLACK OXIDE', diameter: 'M8', type: 'socket_head_cap_screw', material: 'steel', finish: 'black_oxide', length: [30, 'mm'] },
  { catalogId: 'CAT-0508', sku: 'PXSOC830BRZC0508', description: 'M8-1.25 X 30MM SOC HEAD CAP SCREW ASME B18.2.1 BRASS ZN', diameter: 'M8', type: 'socket_head_cap_screw', material: 'brass', finish: 'zinc', standard: 'ASME B18.2.1', length: [30, 'mm'] },
  { catalogId: 'CAT-0008', sku: 'PXSOC860STZC0008', description: 'm8-1.25 x 60mm soc head cap screw iso 7380 steel zinc', diameter: 'M8', type: 'socket_head_cap_screw', material: 'steel', finish: 'zinc', standard: 'ISO 7380', length: [60, 'mm'] },

  // M8 hex cap screws. CAT-0387 is the 16 mm alternative of section 4.1 of the spec.
  { catalogId: 'CAT-0272', sku: 'PXHEX8888BO0272', description: 'M8-1.25 X 8MM HEX CAP SCREW DIN 933 18-8 SS BLACK OXIDE', diameter: 'M8', type: 'hex_cap_screw', material: 'ss_18_8', finish: 'black_oxide', standard: 'DIN 933', length: [8, 'mm'] },
  { catalogId: 'CAT-0313', sku: 'PXHEX810BRBO0313', description: 'M8-1.25 X 10MM HX CAP SCREW ASTM A307 BRASS BLACK OXIDE', diameter: 'M8', type: 'hex_cap_screw', material: 'brass', finish: 'black_oxide', standard: 'ASTM A307', length: [10, 'mm'] },
  { catalogId: 'CAT-0830', sku: 'PXHEX81236HG0830', description: 'M8-1.25 X 12MM HEX CAP SCR ASTM A307 316 SS HDG', diameter: 'M8', type: 'hex_cap_screw', material: 'ss_316', finish: 'hdg', standard: 'ASTM A307', length: [12, 'mm'] },
  { catalogId: 'CAT-0387', sku: 'PXHEX816ALBO0387', description: 'M8-1.25 X 16MM HEX CAP SCREW ASTM A307 ALLOY BLACK OXIDE', diameter: 'M8', type: 'hex_cap_screw', material: 'alloy', finish: 'black_oxide', standard: 'ASTM A307', length: [16, 'mm'] },
  { catalogId: 'CAT-0680', sku: 'PXHEX860A2PL0680', description: 'M8-1.25 X 60MM HX CAP SCR IFI 111 A2 SS PLAIN', diameter: 'M8', type: 'hex_cap_screw', material: 'ss_a2', finish: 'plain', standard: 'IFI 111', length: [60, 'mm'] },

  // M8 tap bolts, so the hex-head family has a second member at M8.
  { catalogId: 'CAT-0388', sku: 'PXTAP810A2HG0388', description: 'M8-1.25 X 10MM TAP BOLT ASTM A307 A2 SS HDG', diameter: 'M8', type: 'tap_bolt', material: 'ss_a2', finish: 'hdg', standard: 'ASTM A307', length: [10, 'mm'] },
  { catalogId: 'CAT-0550', sku: 'PXTAP816BRHG0550', description: 'M8-1.25x16MM TAP BOLT ASME B18.2.1 BRASS HDG', diameter: 'M8', type: 'tap_bolt', material: 'brass', finish: 'hdg', standard: 'ASME B18.2.1', length: [16, 'mm'] },
  { catalogId: 'CAT-0021', sku: 'PXTAP840ALZC0021', description: 'M8-1.25x40MM TAP BOLT IFI 111 ALLOY ZINC', diameter: 'M8', type: 'tap_bolt', material: 'alloy', finish: 'zinc', standard: 'IFI 111', length: [40, 'mm'] },

  // 3/4-10 x 5/8: four types at one size. Only the tap bolt is hex-head.
  { catalogId: 'CAT-0304', sku: 'PXSOC3458ALZC0304', description: '3/4-10 X 5/8" SOCKET HEAD CAP SCREW ALLOY ZINC', diameter: '3/4', type: 'socket_head_cap_screw', material: 'alloy', finish: 'zinc', length: [0.625, 'in'] },
  { catalogId: 'CAT-0380', sku: 'PXPAN345888HG0380', description: '3/4-10 X 5/8" PHILLIPS PAN MACHINE SCREW IFI 111 18-8 SS HDG', diameter: '3/4', type: 'pan_machine_screw', material: 'ss_18_8', finish: 'hdg', standard: 'IFI 111', length: [0.625, 'in'] },
  { catalogId: 'CAT-0384', sku: 'PXTAP3458STZC0384', description: '3/4-10 X 5/8" TAP BOLT ASME B18.2.1 STEEL ZINC', diameter: '3/4', type: 'tap_bolt', material: 'steel', finish: 'zinc', standard: 'ASME B18.2.1', length: [0.625, 'in'] },
  { catalogId: 'CAT-0652', sku: 'PXROD3458ALMZ0652', description: '3/4-10 X 5/8" THREADED ROD ASME B18.2.1 ALLOY MECH ZINC', diameter: '3/4', type: 'threaded_rod', material: 'alloy', finish: 'mech_zinc', length: [0.625, 'in'] },

  // 1/2-13 hex nuts: exactly one is brass.
  { catalogId: 'CAT-0038', sku: 'PXNUT126A2BO0038', description: '1/2-13 HEX NUT IFI 111 A2 SS BLACK OXIDE', diameter: '1/2', type: 'hex_nut', material: 'ss_a2', finish: 'black_oxide', standard: 'IFI 111' },
  { catalogId: 'CAT-0107', sku: 'PXNUT123BRZC0107', description: '1/2-13 HEX NUT ISO 7380 BRASS ZINC', diameter: '1/2', type: 'hex_nut', material: 'brass', finish: 'zinc', standard: 'ISO 7380' },
  { catalogId: 'CAT-0394', sku: 'PXNUT124ALHG0394', description: '1/2-13 HEX NUT DIN 912 ALLOY HDG', diameter: '1/2', type: 'hex_nut', material: 'alloy', finish: 'hdg', standard: 'DIN 912' },
  { catalogId: 'CAT-0459', sku: 'PXNUT12114ALBO0459', description: '1/2-13 HEX NUT ASTM A307 ALLOY BLACK OXIDE', diameter: '1/2', type: 'hex_nut', material: 'alloy', finish: 'black_oxide', standard: 'ASTM A307' },
  { catalogId: 'CAT-0768', sku: 'PXNUT1221288PL0768', description: '1/2-13 hex nut din 912 18-8 ss plain', diameter: '1/2', type: 'hex_nut', material: 'ss_18_8', finish: 'plain', standard: 'DIN 912' },
];

export const ITEMS: readonly CatalogItem[] = SEEDS.map(toItem);
