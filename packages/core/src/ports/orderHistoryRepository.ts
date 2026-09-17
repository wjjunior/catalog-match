import type { CustomerSummary, HistoryLine } from '../domain/catalog';

export interface OrderHistoryRepository {
  all(): readonly HistoryLine[];
  byCustomer(customerId: string): readonly HistoryLine[];
  customers(): readonly CustomerSummary[];
  /** The reference for recency, so results never depend on the wall clock. */
  latestOrderDate(): string;
}
