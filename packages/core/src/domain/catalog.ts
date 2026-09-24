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

export interface Purchase {
  count: number;
  lastOrderDate: string;
  spec: ParsedSpec;
}

export interface CustomerProfile {
  customerId: string;
  customerName: string;
  nEff: number;
  lambda: number;
  referenceDate: string;
  shares: {
    material: Record<string, number>;
    finish: Record<string, number>;
    threadSystem: Record<string, number>;
  };
  repeats: Record<string, number>;
  purchases: Record<string, Purchase>;
  discontinued: readonly string[];
  warnings: readonly string[];
}
