export const PRODUCT_TYPES = [
  'hex_cap_screw',
  'socket_head_cap_screw',
  'button_socket_cap_screw',
  'pan_machine_screw',
  'lag_screw',
  'tap_bolt',
  'threaded_rod',
  'hex_nut',
  'flat_washer',
  'lock_washer',
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

/** Hex-head terms cover both, because a tap bolt is a fully threaded hex bolt. */
export const HEX_HEAD_TYPES = [
  'hex_cap_screw',
  'tap_bolt',
] as const satisfies readonly ProductType[];

export const MATERIALS = ['steel', 'ss_18_8', 'ss_316', 'ss_a2', 'brass', 'alloy'] as const;

export type Material = (typeof MATERIALS)[number];

export const MATERIAL_FAMILIES = ['stainless', 'steel', 'brass', 'alloy'] as const;

export type MaterialFamily = (typeof MATERIAL_FAMILIES)[number];

export const MATERIAL_FAMILY: Readonly<Record<Material, MaterialFamily>> = {
  steel: 'steel',
  ss_18_8: 'stainless',
  ss_316: 'stainless',
  ss_a2: 'stainless',
  brass: 'brass',
  alloy: 'alloy',
};

export const FINISHES = [
  'zinc',
  'yellow_zinc',
  'mech_zinc',
  'hdg',
  'plain',
  'black_oxide',
] as const;

export type Finish = (typeof FINISHES)[number];

export const FINISH_FAMILIES = ['zinc_family', 'hdg', 'plain', 'black_oxide'] as const;

export type FinishFamily = (typeof FINISH_FAMILIES)[number];

export const FINISH_FAMILY: Readonly<Record<Finish, FinishFamily>> = {
  zinc: 'zinc_family',
  yellow_zinc: 'zinc_family',
  mech_zinc: 'zinc_family',
  hdg: 'hdg',
  plain: 'plain',
  black_oxide: 'black_oxide',
};

/** Assigned independently of product type: DIN 912 appears on washers, ISO 7380 on nuts. */
export const STANDARDS = [
  'ASME B18.2.1',
  'DIN 912',
  'DIN 933',
  'ISO 7380',
  'IFI 111',
  'ASTM A307',
  'CLASS 8',
] as const;

export type Standard = (typeof STANDARDS)[number];

export const THREAD_SYSTEMS = ['metric', 'imperial', 'number'] as const;

export type ThreadSystem = (typeof THREAD_SYSTEMS)[number];
