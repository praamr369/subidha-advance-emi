import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type QueryValue = string | number | undefined | null;

function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export type InventoryItem = {
  id: number;
  product: number;
  product_code?: string;
  product_name?: string;
  sku?: string | null;
  unit_of_measure: string;
  stock_tracking_enabled: boolean;
  opening_stock_qty: string;
  reorder_level_qty: string;
  valuation_method: "FIFO" | "AVG";
  standard_unit_cost?: string | null;
  is_active: boolean;
  current_stock_qty?: string;
};

export type StockLedgerRow = {
  id: number;
  inventory_item_id: number;
  product_code: string;
  product_name: string;
  movement_type: string;
  quantity_in: string;
  quantity_out: string;
  movement_date: string;
  reference_model: string;
  reference_id: string;
  notes?: string;
  posted_by_username?: string | null;
  posted_journal_entry_id?: number | null;
};

export type StockSummaryRow = {
  item_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  sku?: string | null;
  unit_of_measure: string;
  stock_tracking_enabled: boolean;
  opening_stock_qty: string;
  reorder_level_qty: string;
  on_hand_qty: string;
  is_below_reorder: boolean;
};

export type InventoryValuationRow = {
  inventory_item_id: number;
  product_code: string;
  product_name: string;
  sku?: string | null;
  valuation_method: "FIFO" | "AVG";
  as_of_date: string;
  on_hand_qty: string;
  unit_cost: string;
  stock_value: string;
};

export type InventoryValuationReport = {
  as_of_date: string;
  count: number;
  total_value: string;
  rows: InventoryValuationRow[];
};

export type StockAdjustmentLine = {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string;
  product_name?: string;
  quantity_delta: string;
  notes?: string;
};

export type StockAdjustment = {
  id: number;
  adjustment_no: string;
  adjustment_date: string;
  status: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";
  reason?: string;
  lines: StockAdjustmentLine[];
  approved_by_username?: string | null;
  posted_by_username?: string | null;
  posted_journal_entry?: number | null;
};

export function listInventoryItems(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<InventoryItem>>(`/inventory/items/${buildQuery(params)}`);
}

export function listStockLedger(params: Record<string, QueryValue> = {}) {
  return apiFetch<{ count: number; results: StockLedgerRow[] }>(
    `/inventory/stock-ledger/${buildQuery(params)}`
  );
}

export function listInventoryMovements(params: Record<string, QueryValue> = {}) {
  return apiFetch<{ count: number; results: StockLedgerRow[] }>(
    `/inventory/movements/${buildQuery(params)}`
  );
}

export function getStockSummary(params: Record<string, QueryValue> = {}) {
  return apiFetch<{ count: number; results: StockSummaryRow[] }>(
    `/inventory/stock-summary/${buildQuery(params)}`
  );
}

export function getInventoryValuation(params: Record<string, QueryValue> = {}) {
  return apiFetch<InventoryValuationReport>(
    `/inventory/valuation/${buildQuery(params)}`
  );
}

export function listStockAdjustments(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<StockAdjustment>>(
    `/inventory/stock-adjustments/${buildQuery(params)}`
  );
}

export function approveStockAdjustment(id: number) {
  return apiFetch<{ updated: boolean; stock_adjustment: StockAdjustment }>(
    `/inventory/stock-adjustments/${id}/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function postStockAdjustment(id: number) {
  return apiFetch<{ updated: boolean; stock_adjustment: StockAdjustment }>(
    `/inventory/stock-adjustments/${id}/post/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}
