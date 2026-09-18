import type { CustomerSummary, HistoryLine } from '../../domain/catalog';
import type { OrderHistoryRepository } from '../../ports/orderHistoryRepository';

export class InMemoryOrderHistoryRepository implements OrderHistoryRepository {
  private readonly lines: readonly HistoryLine[];

  constructor(lines: readonly HistoryLine[]) {
    this.lines = [...lines];
  }

  all(): readonly HistoryLine[] {
    return [...this.lines];
  }

  byCustomer(customerId: string): readonly HistoryLine[] {
    return this.lines.filter((line) => line.customerId === customerId);
  }

  customers(): readonly CustomerSummary[] {
    const summaries = new Map<string, CustomerSummary>();

    for (const line of this.lines) {
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

  latestOrderDate(): string {
    return this.lines.reduce(
      (latest, line) => (line.orderDate > latest ? line.orderDate : latest),
      '',
    );
  }
}
