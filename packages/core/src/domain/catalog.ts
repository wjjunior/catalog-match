import type { ParsedSpec } from './spec';

export interface CatalogItem {
  catalogId: string;
  sku: string;
  description: string;
  active: boolean;
  spec: ParsedSpec;
}

export interface HistoryLine {
  customerId: string;
  customerName: string;
  orderDate: string;
  sku: string;
  description: string;
  quantity: number;
}

export interface CustomerSummary {
  customerId: string;
  customerName: string;
  orderCount: number;
  lastOrderDate: string;
}

/** nEff, lambda, shares and repeats are the quantities of docs/DESIGN.md 7.2. */
export interface CustomerProfile {
  customerId: string;
  customerName: string;
  nEff: number;
  lambda: number;
  /** Recency is measured from this date, never from the wall clock. */
  referenceDate: string;
  shares: {
    material: Record<string, number>;
    finish: Record<string, number>;
    threadSystem: Record<string, number>;
  };
  repeats: Record<string, number>;
}
