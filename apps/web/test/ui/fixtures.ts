import type {
  Alternative,
  CustomerSummary,
  Explanation,
  Match,
  MatchResponse,
  Note,
} from '../../src/shared/api/client';

// Descriptions and SKUs are read off data/catalog.csv; customers off data/order_history.csv.

export function explanation(fields: Partial<Explanation> = {}): Explanation {
  return {
    matched: [],
    unspecified: [],
    unverified: [],
    compatibleCount: 1,
    disambiguateBy: [],
    ...fields,
  };
}

export function match(fields: Partial<Match> = {}): Match {
  return {
    sku: 'PXWASH88088PL0688',
    catalogId: 'CAT-0688',
    description: 'M8-1.25 FLAT WASHER 18-8 SS PLAIN',
    active: true,
    confidence: 0.82,
    label: 'High',
    explanation: explanation(),
    components: { compatibility: 0.9, prior: 0.2 },
    ...fields,
  };
}

export function alternative(fields: Partial<Alternative> = {}): Alternative {
  return {
    sku: 'PXSOC0830ALBO0004',
    catalogId: 'CAT-0004',
    description: 'M8-1.25 X 30MM SOCKET HEAD CAP SCREW ALLOY BLACK OXIDE',
    active: true,
    closeness: 0.67,
    relaxed: ['length'],
    explanation: explanation({ relaxed: ['length'], closeness: 0.67, compatibleCount: 0 }),
    ...fields,
  };
}

export function response(fields: Partial<MatchResponse> = {}): MatchResponse {
  return {
    query: 'M8 flat washer',
    parsed: {},
    status: 'unique',
    compatibleCount: 1,
    results: [],
    alternatives: [],
    notes: [],
    timingsMs: { parse: 0.2, match: 0.4 },
    ...fields,
  };
}

export function note(code: Note['code'], message: string): Note {
  return { code, message };
}

export function customer(fields: Partial<CustomerSummary> = {}): CustomerSummary {
  return {
    customerId: 'CUST-003',
    customerName: 'Marine Electrical Corp',
    orderCount: 7,
    lastOrderDate: '2025-09-02',
    ...fields,
  };
}
