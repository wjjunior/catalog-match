import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CsvOrderHistoryRepository } from '../adapters/csv/csvOrderHistoryRepository';
import type { HistoryLine } from '../domain/catalog';
import type { ParsedSpec } from '../domain/spec';
import { DEFAULT_MATCHER_CONFIG as config } from '../matching/config';
import { parseQuery } from '../parsing/queryParser';
import { resolveReference, type ReferencedLine } from './historyReference';

const W8 = 'M8-1.25 FLAT WASHER ISO 7380 18-8 SS PLAIN';
const W16 = 'M16-2.0 FLAT WASHER ISO 7380 18-8 SS PLAIN';
const L8 = 'M8-1.25 LOCK WASHER ASTM A307 ALLOY BLACK OXIDE';
const N8 = 'M8-1.25 HEX NUT IFI 111 18-8 SS PLAIN';

function line(orderDate: string, sku: string, description: string, quantity = 10): HistoryLine {
  return { customerId: 'A', customerName: 'A Inc', orderDate, sku, description, quantity };
}

const specOf = (query: string): ParsedSpec => parseQuery(query).spec;

const mixed = [
  line('2026-04-15', 'W8', W8),
  line('2026-03-01', 'L8', L8),
  line('2026-02-01', 'N8', N8),
  line('2026-01-01', 'W16', W16),
];

function pure(lines: readonly HistoryLine[] | undefined, query: string): readonly ReferencedLine[] {
  const reference = resolveReference(lines, specOf(query), config);
  if (reference.form !== 'pure')
    throw new Error(`expected a pure reference, got ${reference.form}`);

  return reference.lines;
}

function override(lines: readonly HistoryLine[], query: string) {
  const reference = resolveReference(lines, specOf(query), config);
  if (reference.form !== 'override') throw new Error(`expected an override, got ${reference.form}`);

  return reference;
}

const skus = (lines: readonly ReferencedLine[]): string[] => lines.map((entry) => entry.sku);

describe('selecting the lines a reference names', () => {
  it('takes the whole history when the query names no type and no diameter', () => {
    expect(skus(pure(mixed, 'reorder'))).toEqual(['W8', 'L8', 'N8', 'W16']);
  });

  it('reads washers as both the flat and the lock washer', () => {
    expect(skus(pure(mixed, 'the same washers as last time'))).toEqual(['W8', 'L8', 'W16']);
  });

  it('keeps only the type the query names when it names one exactly', () => {
    expect(skus(pure(mixed, 'the same flat washers as last time'))).toEqual(['W8', 'W16']);
  });

  it('narrows by diameter as well as by type', () => {
    expect(skus(pure(mixed, 'the usual M8 washers'))).toEqual(['W8', 'L8']);
  });

  it('narrows by diameter alone when the query names no type', () => {
    expect(skus(pure(mixed, 'the usual M8'))).toEqual(['W8', 'L8', 'N8']);
  });

  it('drops a line whose description cannot be read', () => {
    const withGarbage = [line('2026-05-01', 'X', 'XXXX'), ...mixed];

    expect(skus(pure(withGarbage, 'reorder'))).toEqual(['W8', 'L8', 'N8', 'W16']);
  });

  it('resolves to nothing when the customer never bought the type', () => {
    expect(pure(mixed, 'the same rods as last time')).toEqual([]);
  });
});

describe('ranking the referenced lines', () => {
  it('groups a repeated SKU onto its latest date and quantity', () => {
    const repeated = [
      line('2025-09-28', 'W8', W8, 2000),
      line('2026-04-15', 'W8', W8, 2500),
      line('2026-02-18', 'W16', W16, 200),
    ];

    expect(pure(repeated, 'the same washers as last time')).toEqual([
      { sku: 'W8', description: W8, orderDate: '2026-04-15', quantity: 2500, confidence: 0.7 },
      {
        sku: 'W16',
        description: W16,
        orderDate: '2026-02-18',
        quantity: 200,
        confidence: expect.closeTo(0.56, 10),
      },
    ]);
  });

  it('decays the confidence by rank', () => {
    const confidences = pure(mixed, 'reorder').map((entry) => entry.confidence);

    expect(confidences).toEqual([
      expect.closeTo(config.historyConfidence, 10),
      expect.closeTo(config.historyConfidence * config.historyDecayPerRank, 10),
      expect.closeTo(config.historyConfidence * config.historyDecayPerRank ** 2, 10),
      expect.closeTo(config.historyConfidence * config.historyDecayPerRank ** 3, 10),
    ]);
  });

  it('breaks a tie on the same date by the order of the file', () => {
    const sameDay = [line('2026-04-15', 'L8', L8), line('2026-04-15', 'W8', W8)];

    expect(skus(pure(sameDay, 'the same washers as last time'))).toEqual(['L8', 'W8']);
  });
});

describe('the override form', () => {
  const brass = () => override(mixed, 'same washers as last time, but brass');

  it('stays a pure reference when the query adds only type and diameter words', () => {
    expect(resolveReference(mixed, specOf('the same M8 washers as last time'), config).form).toBe(
      'pure',
    );
  });

  it('takes the most recent referenced line as the base', () => {
    expect(brass().base).toMatchObject({ sku: 'W8', orderDate: '2026-04-15' });
  });

  it('overwrites the base with the attribute the query states', () => {
    expect(brass().spec.material?.value).toBe('brass');
  });

  it('names the attributes the query changed, so the note can quote them', () => {
    expect(brass().changed).toEqual(['material']);
  });

  it('names nothing changed when the query restates what the base already said', () => {
    expect(override(mixed, 'same washers as last time, but plain').changed).toEqual([]);
  });

  // The standard belongs to the SKU the customer happened to buy, not to the request: an
  // M8 brass washer under ISO 7380 does not exist, so keeping it would match nothing.
  it('drops the standard of the base', () => {
    expect(brass().spec.standard).toBeUndefined();
  });

  it('keeps the type and diameter of the base, which the query only used to select', () => {
    expect(brass().spec.type?.map((entry) => entry.value)).toEqual(['flat_washer']);
    expect(brass().spec.diameter?.nominal).toBe('M8');
  });

  it('inherits the attributes the query left unsaid', () => {
    expect(brass().spec.finish?.value).toBe('plain');
    expect(brass().spec.pitch).toBe('1.25');
  });

  it('marks what it inherited inferred and what the query stated explicit', () => {
    expect(brass().spec.provenance).toMatchObject({
      material: 'explicit',
      finish: 'inferred',
      type: 'inferred',
      diameter: 'inferred',
    });
  });

  it('carries the residue of the query, never of the base', () => {
    expect(brass().spec.residue).toEqual(['as', 'but']);
  });
});

describe('a query without a customer', () => {
  it('asks for a customer instead of resolving the reference', () => {
    expect(resolveReference(undefined, specOf('the same washers as last time'), config)).toEqual({
      form: 'needsCustomer',
    });
  });

  it('separates a customer with no history from no customer at all', () => {
    expect(pure([], 'the same washers as last time')).toEqual([]);
  });
});

describe('the real files', () => {
  const historyPath = fileURLToPath(new URL('../../../../data/order_history.csv', import.meta.url));
  const history = CsvOrderHistoryRepository.load(historyPath);
  const washersOf = (customerId: string) =>
    pure(history.byCustomer(customerId), 'the same washers as last time');

  it('resolves the washers CUST-002 keeps reordering', () => {
    expect(washersOf('CUST-002')).toEqual([
      {
        sku: 'PXWASH88088PL0688',
        description: W8,
        orderDate: '2026-04-15',
        quantity: 2500,
        confidence: 0.7,
      },
      {
        sku: 'PXWASH163088PL0030',
        description: W16,
        orderDate: '2026-02-18',
        quantity: 200,
        confidence: expect.closeTo(0.56, 10),
      },
      {
        sku: 'PXLOCK8888PL0111',
        description: 'M8-1.25 LOCK WSHR ISO 7380 18-8 SS PLAIN',
        orderDate: '2026-02-18',
        quantity: 500,
        confidence: expect.closeTo(0.448, 10),
      },
      {
        sku: 'PXWASH38688PL0206',
        description: '3/8-16 FLAT WASHER DIN 933 18-8 SS PLAIN',
        orderDate: '2025-08-15',
        quantity: 800,
        confidence: expect.closeTo(0.3584, 10),
      },
    ]);
  });

  it('breaks the 2026-02-18 tie by the order of the file, flat washer before lock', () => {
    const [, second, third] = washersOf('CUST-002');

    expect(second?.orderDate).toBe(third?.orderDate);
    expect([second?.sku, third?.sku]).toEqual(['PXWASH163088PL0030', 'PXLOCK8888PL0111']);
  });

  it('resolves the lock washer CUST-004 bought last', () => {
    expect(washersOf('CUST-004')[0]).toMatchObject({
      sku: 'PXLOCK860ALBO0237',
      orderDate: '2026-04-25',
    });
  });

  it('reads the abbreviated WSHR of the CUST-003 line as a washer', () => {
    expect(washersOf('CUST-003')[0]).toMatchObject({
      sku: 'PXWASHN8112BRPL0012',
      orderDate: '2026-03-30',
    });
  });

  it('merges brass onto the M8 washer CUST-002 ordered on 2026-04-15', () => {
    const merged = override(history.byCustomer('CUST-002'), 'same washers as last time, but brass');

    expect(merged.base).toMatchObject({ sku: 'PXWASH88088PL0688', orderDate: '2026-04-15' });
    expect(merged.changed).toEqual(['material']);
    expect(merged.spec).toMatchObject({
      diameter: { nominal: 'M8' },
      pitch: '1.25',
      material: { value: 'brass' },
      finish: { value: 'plain' },
    });
    expect(merged.spec.standard).toBeUndefined();
    expect(merged.spec.type?.map((entry) => entry.value)).toEqual(['flat_washer']);
  });

  it('returns the same reference for the same query', () => {
    expect(washersOf('CUST-002')).toEqual(washersOf('CUST-002'));
  });
});
