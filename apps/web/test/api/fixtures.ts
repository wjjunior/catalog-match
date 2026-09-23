import type {
  CustomerSummary,
  MatchRequest,
  MatchResponse,
  MatchStatus,
} from '@catalog-match/core';

import type { Core } from '../../server/core';

const parsed: MatchResponse['parsed'] = {
  diameter: { system: 'metric', nominal: 'M8', mm: 8, known: true },
  pitch: '1.25',
  length: { value: 50, unit: 'mm', mm: 50 },
  type: [{ value: 'hex_cap_screw', strength: 1 }],
  material: { value: 'steel', strength: 1 },
  residue: [],
  evidence: { diameter: 'm8', length: '50mm', type: 'hex bolt' },
  provenance: { diameter: 'explicit', length: 'explicit', type: 'inferred' },
};

const explanation: MatchResponse['results'][number]['explanation'] = {
  matched: [
    { attr: 'diameter', query: 'm8', item: 'M8', provenance: 'explicit' },
    { attr: 'material', query: 'steel', item: 'Steel', provenance: 'inferred', partial: true },
  ],
  unspecified: ['finish'],
  unverified: [],
  compatibleCount: 1,
  disambiguateBy: [],
};

const match: MatchResponse['results'][number] = {
  sku: 'HCS-M8-050-ST-ZN',
  catalogId: 'C-0001',
  description: 'Hex Cap Screw M8-1.25 x 50mm Steel Zinc',
  active: true,
  confidence: 0.92,
  label: 'High',
  explanation,
  components: { compatibility: 0.95, prior: 0.5 },
};

const alternative: MatchResponse['alternatives'][number] = {
  sku: 'HCS-M8-045-ST-ZN',
  catalogId: 'C-0002',
  description: 'Hex Cap Screw M8-1.25 x 45mm Steel Zinc',
  active: false,
  closeness: 0.8,
  relaxed: ['length'],
  explanation: { ...explanation, relaxed: ['length'], closeness: 0.8 },
};

// A Record over MatchStatus, so a status added to the domain breaks compilation here
// rather than quietly going untested.
export const RESPONSE_BY_STATUS: Readonly<Record<MatchStatus, MatchResponse>> = {
  unique: {
    query: 'm8 hex bolt 50mm',
    parsed,
    status: 'unique',
    compatibleCount: 1,
    results: [match],
    alternatives: [],
    notes: [],
    timingsMs: { parse: 1.2, match: 3.4 },
  },
  ambiguous: {
    query: 'm8 bolt',
    parsed: { ...parsed, length: undefined, material: undefined },
    status: 'ambiguous',
    compatibleCount: 7,
    results: [match, { ...match, sku: 'HCS-M8-060-ST-ZN', confidence: 0.4, label: 'Low' }],
    alternatives: [],
    notes: [{ code: 'unverifiedResidue', message: 'Specify material or finish.' }],
    timingsMs: { parse: 0.8, match: 2.1 },
  },
  none: {
    query: 'm8 socket head 45mm',
    parsed,
    status: 'none',
    compatibleCount: 0,
    results: [],
    alternatives: [alternative],
    notes: [{ code: 'failedConstraint', message: 'No M8 socket head cap screw at 45 mm.' }],
    timingsMs: { parse: 1, match: 5 },
  },
  history: {
    query: 'same bolt as last time',
    parsed: { ...parsed, residue: ['last time'] },
    status: 'history',
    compatibleCount: 0,
    results: [
      {
        ...match,
        explanation: {
          ...explanation,
          personalization: {
            reason: 'Ordered 4 times in the last 90 days.',
            prior: 0.72,
            overriddenBy: ['finish'],
          },
        },
      },
    ],
    alternatives: [],
    notes: [{ code: 'historyReference', message: 'Resolved from order history.' }],
    timingsMs: { parse: 2, match: 6 },
  },
  unparsed: {
    query: 'asdf qwerty',
    parsed: { residue: ['asdf', 'qwerty'], evidence: {}, provenance: {} },
    status: 'unparsed',
    compatibleCount: 0,
    results: [],
    alternatives: [],
    notes: [{ code: 'unknownType', message: 'Nothing recognised; showing lexical matches.' }],
    timingsMs: { parse: 0.5, match: 1.5 },
  },
};

export const CUSTOMERS: readonly CustomerSummary[] = [
  {
    customerId: 'C001',
    customerName: 'Acme Fasteners',
    orderCount: 12,
    lastOrderDate: '2024-11-02',
  },
  { customerId: 'C002', customerName: 'Bolt Depot', orderCount: 3, lastOrderDate: '2024-09-15' },
];

export interface StubCore extends Core {
  matchCalls: MatchRequest[];
  customerCalls: (string | undefined)[];
}

export function stubCore(
  response: MatchResponse = RESPONSE_BY_STATUS.unique,
  customers: readonly CustomerSummary[] = CUSTOMERS,
): StubCore {
  const matchCalls: MatchRequest[] = [];
  const customerCalls: (string | undefined)[] = [];

  return {
    matchCalls,
    customerCalls,
    matchQuery(request) {
      matchCalls.push(request);
      return { ...response, query: request.query };
    },
    listCustomers(q) {
      customerCalls.push(q);
      return [...customers];
    },
  };
}
