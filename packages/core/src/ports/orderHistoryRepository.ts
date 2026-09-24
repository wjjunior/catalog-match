import type { CustomerSummary, HistoryLine } from '../domain/catalog';

export interface OrderHistoryRepository {
  all(): readonly HistoryLine[];
  byCustomer(customerId: string): readonly HistoryLine[];
  customers(): readonly CustomerSummary[];
  latestOrderDate(): string;
}
