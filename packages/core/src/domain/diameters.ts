import type { ThreadSystem } from './attributes';

export interface DiameterSpec {
  readonly nominal: string;
  readonly system: ThreadSystem;
  /** Metric pitch in millimetres ('1.25') or imperial threads per inch ('13'). */
  readonly pitch: string;
  readonly mm: number;
}

export const DIAMETERS = [
  { nominal: '1/4', system: 'imperial', pitch: '20', mm: 6.35 },
  { nominal: '5/16', system: 'imperial', pitch: '18', mm: 7.9375 },
  { nominal: '3/8', system: 'imperial', pitch: '16', mm: 9.525 },
  { nominal: '7/16', system: 'imperial', pitch: '14', mm: 11.1125 },
  { nominal: '1/2', system: 'imperial', pitch: '13', mm: 12.7 },
  { nominal: '5/8', system: 'imperial', pitch: '11', mm: 15.875 },
  { nominal: '3/4', system: 'imperial', pitch: '10', mm: 19.05 },
  { nominal: 'M4', system: 'metric', pitch: '0.7', mm: 4 },
  { nominal: 'M5', system: 'metric', pitch: '0.8', mm: 5 },
  { nominal: 'M6', system: 'metric', pitch: '1.0', mm: 6 },
  { nominal: 'M8', system: 'metric', pitch: '1.25', mm: 8 },
  { nominal: 'M10', system: 'metric', pitch: '1.5', mm: 10 },
  { nominal: 'M12', system: 'metric', pitch: '1.75', mm: 12 },
  { nominal: 'M16', system: 'metric', pitch: '2.0', mm: 16 },
  // Numbered sizes: 0.060in + 0.013in per number.
  { nominal: '#8', system: 'number', pitch: '32', mm: 4.1656 },
  { nominal: '#10', system: 'number', pitch: '24', mm: 4.826 },
] as const satisfies readonly DiameterSpec[];

export type KnownDiameterNominal = (typeof DIAMETERS)[number]['nominal'];
