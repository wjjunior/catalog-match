import { describe, expect, it } from 'vitest';

import type { CatalogRepository } from '../ports/catalogRepository';
import type { Matcher } from '../ports/matcher';
import type { OrderHistoryRepository } from '../ports/orderHistoryRepository';
import { DEFAULT_MATCHER_CONFIG } from '../matching/config';
import {
  FINISHES,
  FINISH_FAMILY,
  HEX_HEAD_TYPES,
  MATERIALS,
  MATERIAL_FAMILY,
  PRODUCT_TYPES,
  STANDARDS,
} from './attributes';
import type { CatalogItem, CustomerProfile, HistoryLine } from './catalog';
import type { DescriptionParser, HistoryPrior, QueryParser } from './contracts';
import { DIAMETERS } from './diameters';
import type { Explanation, MatchRequest, MatchResponse } from './match';
import { MATCH_STATUSES, NOTE_CODES } from './match';
import type { ParsedSpec } from './spec';
import { ATTRIBUTE_NAMES } from './spec';

// Read off data/catalog.csv, not from the design document.
const EXPECTED_PITCHES: ReadonlyArray<readonly [string, string]> = [
  ['1/4', '20'],
  ['5/16', '18'],
  ['3/8', '16'],
  ['7/16', '14'],
  ['1/2', '13'],
  ['5/8', '11'],
  ['3/4', '10'],
  ['M4', '0.7'],
  ['M5', '0.8'],
  ['M6', '1.0'],
  ['M8', '1.25'],
  ['M10', '1.5'],
  ['M12', '1.75'],
  ['M16', '2.0'],
  ['#8', '32'],
  ['#10', '24'],
];

describe('attribute tables', () => {
  it('carries the ten product types, six materials, six finishes and seven standards', () => {
    expect(PRODUCT_TYPES).toHaveLength(10);
    expect(MATERIALS).toHaveLength(6);
    expect(FINISHES).toHaveLength(6);
    expect(STANDARDS).toHaveLength(7);
  });

  it('has no duplicate value in any table', () => {
    for (const table of [PRODUCT_TYPES, MATERIALS, FINISHES, STANDARDS]) {
      expect(new Set(table).size).toBe(table.length);
    }
  });
});

describe('family maps', () => {
  it('groups exactly the three stainless materials under the stainless family', () => {
    const stainless = MATERIALS.filter((material) => MATERIAL_FAMILY[material] === 'stainless');

    expect(stainless).toEqual(['ss_18_8', 'ss_316', 'ss_a2']);
  });

  it('groups exactly the three zinc finishes under the zinc family', () => {
    const zinc = FINISHES.filter((finish) => FINISH_FAMILY[finish] === 'zinc_family');

    expect(zinc).toEqual(['zinc', 'yellow_zinc', 'mech_zinc']);
  });

  it('treats hex cap screw and tap bolt as the hex-head family', () => {
    expect([...HEX_HEAD_TYPES]).toEqual(['hex_cap_screw', 'tap_bolt']);
  });

  it('assigns a family to every material and every finish, and to nothing else', () => {
    expect(Object.keys(MATERIAL_FAMILY).sort()).toEqual([...MATERIALS].sort());
    expect(Object.keys(FINISH_FAMILY).sort()).toEqual([...FINISHES].sort());
  });
});

describe('diameter table', () => {
  it('holds the sixteen catalog diameters', () => {
    expect(DIAMETERS).toHaveLength(16);
  });

  it('gives each diameter its single catalog pitch', () => {
    expect(DIAMETERS.map((d) => [d.nominal, d.pitch])).toEqual(
      EXPECTED_PITCHES.map(([nominal, pitch]) => [nominal, pitch]),
    );
  });

  it('converts each nominal to millimetres', () => {
    const mm = Object.fromEntries(DIAMETERS.map((d) => [d.nominal, d.mm]));

    expect(mm['M8']).toBe(8);
    expect(mm['1/2']).toBe(12.7);
    expect(mm['5/16']).toBeCloseTo(7.9375, 4);
    expect(mm['#8']).toBeCloseTo(4.1656, 4);
    expect(mm['#10']).toBeCloseTo(4.826, 4);
  });

  it('labels each diameter with the thread system its nominal is written in', () => {
    for (const diameter of DIAMETERS) {
      const expected = diameter.nominal.startsWith('M')
        ? 'metric'
        : diameter.nominal.startsWith('#')
          ? 'number'
          : 'imperial';

      expect(diameter.system).toBe(expected);
      expect(diameter.mm).toBeGreaterThan(0);
    }
  });

  it('lists every nominal once', () => {
    const nominals = DIAMETERS.map((d) => d.nominal);

    expect(new Set(nominals).size).toBe(nominals.length);
  });
});

describe('matcher config defaults', () => {
  it('carries the parameters of the posterior model', () => {
    expect(DEFAULT_MATCHER_CONFIG.epsilon).toBe(0.02);
    expect(DEFAULT_MATCHER_CONFIG.kappa).toBe(3);
  });

  it('carries the personalization parameters', () => {
    expect(DEFAULT_MATCHER_CONFIG.tauDays).toBe(180);
    expect(DEFAULT_MATCHER_CONFIG.k).toBe(5);
    expect(DEFAULT_MATCHER_CONFIG.alpha).toBe(0.5);
    expect(DEFAULT_MATCHER_CONFIG.wSku).toBe(2);
  });

  it('carries the partial-credit strengths', () => {
    expect(DEFAULT_MATCHER_CONFIG.familyCredit).toBe(0.8);
    expect(DEFAULT_MATCHER_CONFIG.fuzzyStrength).toBe(0.9);
    expect(DEFAULT_MATCHER_CONFIG.termStrengths).toEqual({
      shortForm: 0.9,
      weak: 0.7,
      generic: 0.6,
      ambiguous: 0.5,
      distant: 0.4,
    });
  });

  it('marks the label thresholds as provisional until calibration', () => {
    expect(DEFAULT_MATCHER_CONFIG.labels).toEqual({
      high: 0.7,
      medium: 0.35,
      provisional: true,
    });
  });

  it('relaxes constraints in the order of DESIGN.md 5.6', () => {
    expect(DEFAULT_MATCHER_CONFIG.backoffOrder).toEqual([
      'standard',
      'materialFinishFamily',
      'approximateLength',
      'dropLength',
    ]);
  });

  it('carries the remaining matcher limits', () => {
    expect(DEFAULT_MATCHER_CONFIG.lengthTolerance).toBe(0.25);
    expect(DEFAULT_MATCHER_CONFIG.lexicalCap).toBe(0.4);
    expect(DEFAULT_MATCHER_CONFIG.historyConfidence).toBe(0.7);
    expect(DEFAULT_MATCHER_CONFIG.historyDecayPerRank).toBe(0.8);
  });

  it('keeps every probability-like parameter inside its range', () => {
    const inUnitRange = [
      DEFAULT_MATCHER_CONFIG.epsilon,
      DEFAULT_MATCHER_CONFIG.familyCredit,
      DEFAULT_MATCHER_CONFIG.fuzzyStrength,
      DEFAULT_MATCHER_CONFIG.lexicalCap,
      DEFAULT_MATCHER_CONFIG.historyConfidence,
      DEFAULT_MATCHER_CONFIG.historyDecayPerRank,
      DEFAULT_MATCHER_CONFIG.lengthTolerance,
      ...Object.values(DEFAULT_MATCHER_CONFIG.termStrengths),
    ];

    for (const value of inUnitRange) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('orders the label thresholds', () => {
    expect(DEFAULT_MATCHER_CONFIG.labels.high).toBeGreaterThan(
      DEFAULT_MATCHER_CONFIG.labels.medium,
    );
  });
});

// The literals below are checked by `pnpm typecheck`, not at runtime: they pin the
// shapes of docs/DESIGN.md 8.2, so a renamed or missing field fails the build.

describe('status and note tables', () => {
  it('carries the five match statuses', () => {
    expect([...MATCH_STATUSES]).toEqual(['unique', 'ambiguous', 'none', 'history', 'unparsed']);
  });

  it('has no duplicate note code', () => {
    expect(new Set(NOTE_CODES).size).toBe(NOTE_CODES.length);
  });

  it('names every attribute a constraint can be stated on', () => {
    expect([...ATTRIBUTE_NAMES]).toEqual([
      'diameter',
      'pitch',
      'length',
      'type',
      'material',
      'finish',
      'standard',
    ]);
  });
});

const parsedSpec = {
  diameter: { system: 'metric', nominal: 'M8', mm: 8, known: true },
  length: { value: 45, unit: 'mm', mm: 45 },
  type: [{ value: 'socket_head_cap_screw', strength: 1 }],
  material: { value: 'stainless', strength: 0.8 },
  finish: { value: 'zinc_family', strength: 0.8 },
  standard: 'DIN 912',
  residue: ['nylon'],
  evidence: { diameter: 'M8', type: 'SHCS' },
  provenance: { diameter: 'explicit', type: 'explicit', length: 'inferred' },
} satisfies ParsedSpec;

const catalogItem = {
  catalogId: 'CAT-0001',
  sku: 'PXHEX1434STZC0003',
  description: '1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC',
  active: true,
  spec: parsedSpec,
} satisfies CatalogItem;

const historyLine = {
  customerId: 'CUST-001',
  customerName: 'Midwest Industrial Supply',
  orderDate: '2025-08-12',
  sku: 'PXROD126STZC0002',
  description: '1/2-13 X 6FT FULL THREAD ROD STEEL ZINC',
  quantity: 50,
} satisfies HistoryLine;

const customerProfile = {
  customerId: 'CUST-001',
  customerName: 'Midwest Industrial Supply',
  nEff: 10.4,
  lambda: 0.67,
  referenceDate: '2026-04-25',
  shares: {
    material: { steel: 0.82 },
    finish: { zinc: 0.51 },
    threadSystem: { imperial: 0.6 },
  },
  repeats: { PXROD126STZC0002: 1 },
  purchases: {
    PXROD126STZC0002: { count: 2, lastOrderDate: '2026-04-15', spec: parsedSpec },
  },
  discontinued: ['PXNUT16888PL0901'],
  warnings: [],
} satisfies CustomerProfile;

const explanation = {
  matched: [
    { attr: 'diameter', query: 'M8', item: 'M8', provenance: 'explicit' },
    {
      attr: 'material',
      query: 'stainless',
      item: '18-8 SS',
      provenance: 'explicit',
      partial: true,
    },
  ],
  unspecified: ['finish'],
  unverified: ['nylon'],
  compatibleCount: 7,
  disambiguateBy: ['finish'],
  personalization: { reason: 'bought twice, last on 2026-04-15', prior: 0.42 },
} satisfies Explanation;

const matchResponse = {
  query: 'M8 x 45mm SHCS',
  parsed: parsedSpec,
  status: 'ambiguous',
  compatibleCount: 7,
  results: [
    {
      sku: 'PXSOC845STZC0101',
      catalogId: 'CAT-0101',
      description: 'M8-1.25 X 45MM SOCKET HEAD CAP SCREW STEEL ZINC',
      active: true,
      confidence: 0.42,
      label: 'Medium',
      explanation,
      components: { compatibility: 0.8, prior: 0.42 },
    },
  ],
  alternatives: [
    {
      sku: 'PXSOC840STZC0102',
      catalogId: 'CAT-0102',
      description: 'M8-1.25 X 40MM SOCKET HEAD CAP SCREW STEEL ZINC',
      active: true,
      closeness: 0.75,
      relaxed: ['length'],
      explanation,
    },
  ],
  notes: [{ code: 'unitMismatch', message: 'metric diameter with an inch length' }],
  timingsMs: { parse: 0.4, match: 1.2 },
} satisfies MatchResponse;

const matchRequest = {
  query: 'M8 flat washer',
  customerId: 'CUST-002',
  limit: 3,
} satisfies MatchRequest;

const catalogRepository: CatalogRepository = {
  all: () => [catalogItem],
  active: () => [catalogItem],
  bySku: (sku) => (sku === catalogItem.sku ? catalogItem : undefined),
};

const orderHistoryRepository: OrderHistoryRepository = {
  all: () => [historyLine],
  byCustomer: (customerId) => (customerId === historyLine.customerId ? [historyLine] : []),
  customers: () => [
    {
      customerId: 'CUST-001',
      customerName: 'Midwest Industrial Supply',
      orderCount: 18,
      lastOrderDate: '2026-04-25',
    },
  ],
  latestOrderDate: () => '2026-04-25',
};

const matcher: Matcher = { match: () => matchResponse };

const descriptionParser: DescriptionParser = { parse: () => parsedSpec };
const queryParser: QueryParser = { parse: () => parsedSpec };
const historyPrior: HistoryPrior = {
  prior: (candidates) => candidates.map(() => 1 / candidates.length),
};

describe('contract shapes', () => {
  it('lets the ports and the inner-ring contracts be implemented', () => {
    expect(catalogRepository.bySku(catalogItem.sku)).toBe(catalogItem);
    expect(orderHistoryRepository.byCustomer('CUST-001')).toHaveLength(1);
    expect(matcher.match(matchRequest).status).toBe('ambiguous');
    expect(descriptionParser.parse(catalogItem.description).residue).toEqual(['nylon']);
    expect(queryParser.parse(matchRequest.query).diameter?.nominal).toBe('M8');
    expect(historyPrior.prior([catalogItem], parsedSpec, customerProfile)).toEqual([1]);
  });

  it('keeps the compatible count of a response and its explanations in step', () => {
    for (const result of matchResponse.results) {
      expect(result.explanation.compatibleCount).toBe(matchResponse.compatibleCount);
    }
  });
});
