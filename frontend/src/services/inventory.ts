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
  default_stock_location?: number | null;
  default_stock_location_code?: string | null;
  default_stock_location_name?: string | null;
  stock_tracking_enabled: boolean;
  stock_item_type: "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL";
  delivery_stock_bridge_enabled: boolean;
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
  stock_item_type?: "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL";
  movement_type: string;
  quantity_in: string;
  quantity_out: string;
  movement_date: string;
  stock_location_id?: number | null;
  stock_location_code?: string | null;
  stock_location_name?: string | null;
  branch_id?: number | null;
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
  stock_item_type: "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL";
  delivery_stock_bridge_enabled: boolean;
  opening_stock_qty: string;
  reorder_level_qty: string;
  on_hand_qty: string;
  // Phase 2: reserved and available-to-promise quantities
  reserved_qty?: string;
  available_qty?: string;
  incoming_qty?: string;
  required_for_winners?: string;
  required_for_confirmed_orders?: string;
  is_below_reorder: boolean;
  default_stock_location_id?: number | null;
  default_stock_location_code?: string | null;
  default_stock_location_name?: string | null;
  branch_id?: number | null;
};

export type ProductDemandPlanning = {
  product_id: number;
  active_subscriptions: number;
  locked_batch_demand: number;
  winners_pending_delivery: number;
  direct_sale_orders: number;
  rent_lease_commitments: number;
  total_required: string;
};

export type ProductAvailability = {
  product_id: number;
  on_hand: string;
  reserved: string;
  available: string;
  incoming: string;
  required_for_winners: string;
  required_for_confirmed_orders: string;
  demand: ProductDemandPlanning;
};

export type StockLocation = {
  id: number;
  code: string;
  name: string;
  branch?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  location_type: "STORE" | "WAREHOUSE" | "SHOWROOM";
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type OpeningStockPreviewRow = {
  row: number;
  product_code?: string | null;
  sku?: string | null;
  quantity?: string | null;
  inventory_item_id?: number | null;
  location_code?: string | null;
  location_name?: string | null;
  action: string;
  message?: string | null;
};

export type OpeningStockPreview = {
  total_rows: number;
  error_rows: number;
  ready_rows: number;
  rows: OpeningStockPreviewRow[];
};

export type OpeningStockPostResponse = {
  processed_rows: number;
  created_count: number;
  existing_count: number;
  movement_date: string;
  digest: string;
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
  stock_location?: number | null;
  stock_location_code?: string | null;
  stock_location_name?: string | null;
  lines: StockAdjustmentLine[];
  approved_by_username?: string | null;
  posted_by_username?: string | null;
  posted_journal_entry?: number | null;
};

export type VendorLite = {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string | null;
  state_code?: string | null;
  state_name?: string | null;
  is_active: boolean;
};

export type PurchaseOrder = {
  id: number;
  po_no: string;
  po_date: string;
  vendor: number;
  vendor_name?: string;
  status: "DRAFT" | "SENT" | "PARTIALLY_RECEIVED" | "RECEIVED" | "BILLED" | "CANCELLED";
  notes?: string;
};

export type GoodsReceipt = {
  id: number;
  receipt_no: string;
  receipt_date: string;
  purchase_order: number;
  purchase_order_no?: string;
  vendor_name?: string;
  status: "DRAFT" | "RECEIVED" | "CANCELLED";
};

export type VendorBill = {
  id: number;
  bill_no: string;
  bill_date: string;
  vendor: number;
  vendor_name?: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  subtotal: string;
  tax_total: string;
  grand_total: string;
};

export type StockLocationPayload = {
  code: string;
  name: string;
  branch?: number | null;
  location_type: "STORE" | "WAREHOUSE" | "SHOWROOM";
  is_active: boolean;
  notes?: string;
};

export type InventoryItemUpdatePayload = Partial<
  Pick<
    InventoryItem,
    | "default_stock_location"
    | "stock_tracking_enabled"
    | "stock_item_type"
    | "delivery_stock_bridge_enabled"
    | "reorder_level_qty"
    | "standard_unit_cost"
    | "is_active"
  >
>;

export type CreateStockAdjustmentPayload = {
  adjustment_no?: string;
  adjustment_date: string;
  reason: string;
  stock_location?: number | null;
  lines: Array<{
    inventory_item: number;
    quantity_delta: string;
    notes?: string;
  }>;
};

export function listInventoryItems(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<InventoryItem>>(`/inventory/items/${buildQuery(params)}`);
}

export function updateInventoryItem(
  id: number,
  payload: InventoryItemUpdatePayload
) {
  return apiFetch<InventoryItem>(`/inventory/items/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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

export function getProductDemandPlanning(productId: number | string) {
  return apiFetch<ProductDemandPlanning>(`/inventory/products/${productId}/demand-planning/`);
}

export function getProductAvailability(productId: number | string) {
  return apiFetch<ProductAvailability>(`/inventory/products/${productId}/availability/`);
}

export function generatePurchaseNeed(productId: number | string) {
  return apiFetch<{
    created: boolean;
    detail?: string;
    purchase_need_id?: number;
    required_quantity?: string;
    available_quantity?: string;
    shortage_quantity?: string;
    status?: string;
  }>(`/inventory/products/${productId}/purchase-needs/generate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
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

export function createStockAdjustment(payload: CreateStockAdjustmentPayload) {
  return apiFetch<StockAdjustment>("/inventory/stock-adjustments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listStockLocations(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<StockLocation>>(
    `/inventory/locations/${buildQuery(params)}`
  );
}

export function createStockLocation(payload: StockLocationPayload) {
  return apiFetch<StockLocation>("/inventory/locations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStockLocation(id: number, payload: Partial<StockLocationPayload>) {
  return apiFetch<StockLocation>(`/inventory/locations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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

export function listVendorsLite(params: Record<string, QueryValue> = {}) {
  return apiFetch<{ count: number; results: VendorLite[] }>(`/inventory/vendors/${buildQuery(params)}`);
}

export function listPurchaseOrders(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<PurchaseOrder>>(`/inventory/purchase-orders/${buildQuery(params)}`);
}

export function listGoodsReceipts(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<GoodsReceipt>>(`/inventory/goods-receipts/${buildQuery(params)}`);
}

export function listVendorBills(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<VendorBill>>(`/inventory/vendor-bills/${buildQuery(params)}`);
}

export async function previewOpeningStockImport(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<OpeningStockPreview>("/inventory/opening-stock/preview/", {
    method: "POST",
    body: form,
  });
}

export async function postOpeningStockImport(file: File, asOfDate: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("as_of_date", asOfDate);
  return apiFetch<OpeningStockPostResponse>("/inventory/opening-stock/post/", {
    method: "POST",
    body: form,
  });
}
