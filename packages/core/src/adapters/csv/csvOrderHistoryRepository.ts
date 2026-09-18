import { readFileSync } from 'node:fs';

import type { CustomerSummary, HistoryLine } from '../../domain/catalog';
import type { OrderHistoryRepository } from '../../ports/orderHistoryRepository';
import { parseCsv } from './csv';

export class CsvOrderHistoryRepository implements OrderHistoryRepository {
  private constructor(private readonly lines: readonly HistoryLine[]) {}

  static load(path: string): CsvOrderHistoryRepository {
    return CsvOrderHistoryRepository.fromText(readFileSync(path, 'utf8'));
  }

  static fromText(text: string): CsvOrderHistoryRepository {
    return new CsvOrderHistoryRepository(
      parseCsv(text).map((row) => ({
        customerId: row['customer_id'] ?? '',
        customerName: row['customer_name'] ?? '',
        orderDate: row['order_date'] ?? '',
        sku: row['sku'] ?? '',
        description: row['catalog_description'] ?? '',
        quantity: Number(row['quantity'] ?? 0),
      })),
    );
  }

  all(): readonly HistoryLine[] {
    return [...this.lines];
  }

  byCustomer(customerId: string): readonly HistoryLine[] {
    return this.lines.filter((line) => line.customerId === customerId);
  }

  customers(): readonly CustomerSummary[] {
    return summarise(this.lines);
  }

  latestOrderDate(): string {
    return this.lines.reduce(
      (latest, line) => (line.orderDate > latest ? line.orderDate : latest),
      '',
    );
  }
}

function summarise(lines: readonly HistoryLine[]): CustomerSummary[] {
  const summaries = new Map<string, CustomerSummary>();

  for (const line of lines) {
    const seen = summaries.get(line.customerId);
    if (!seen) {
      summaries.set(line.customerId, {
        customerId: line.customerId,
        customerName: line.customerName,
        orderCount: 1,
        lastOrderDate: line.orderDate,
      });
      continue;
    }
    seen.orderCount++;
    if (line.orderDate > seen.lastOrderDate) seen.lastOrderDate = line.orderDate;
  }

  return [...summaries.values()];
}
