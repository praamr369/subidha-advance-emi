import { apiFetch } from "@/lib/api";

type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type QueryValue = string | number | boolean | undefined | null;

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

export type AdminInventoryItemSearchLocationRow = {
  stock_location_id: number;
  stock_location_name: string;
  stock_location_code: string;
  available_quantity: string;
};

export type AdminInventoryItemSearchRow = {
  id: number;
  inventory_item_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  default_stock_location_id?: number | null;
  available_by_location: AdminInventoryItemSearchLocationRow[];
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

/** Admin `/admin/inventory/opening-stock/` workflow (draft → post, auditable). */
export type OpeningStockEntryRow = {
  id: number;
  batch: number | null;
  batch_key: string | null;
  csv_row_number: number | null;
  inventory_item: number;
  product_code: string;
  product_name: string;
  sku: string | null;
  stock_location: number;
  stock_location_code: string;
  stock_location_name: string;
  quantity: string;
  unit_cost_snapshot: string | null;
  valuation_amount_snapshot: string | null;
  effective_date: string;
  note: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  source: string;
  created_by: number | null;
  posted_by: number | null;
  posted_at: string | null;
  cancelled_at: string | null;
  correction_adjustment: number | null;
  created_at: string;
  updated_at: string;
};

export type OpeningStockBulkPreviewRow = OpeningStockPreviewRow & {
  unit_cost?: string | null;
  effective_date?: string | null;
  update_mode?: string | null;
  quantity_delta?: string | null;
};

export type OpeningStockBulkPreview = {
  batch_key: string;
  total_rows: number;
  error_rows: number;
  warning_rows: number;
  ready_rows: number;
  total_quantity_preview: string;
  total_valuation_preview: string;
  rows: OpeningStockBulkPreviewRow[];
};

export type OpeningStockBulkApplySummary = {
  batch_key: string;
  dry_run: boolean;
  created: number;
  updated: number;
  posted: number;
  skipped: number;
  corrections_created: number;
  failed: number;
};

export type OpeningStockBatchHistoryRow = {
  batch_key: string;
  original_filename: string;
  created_at: string;
  created_by_username: string | null;
  last_apply_summary: OpeningStockBulkApplySummary | Record<string, unknown> | null;
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

export type AdjustmentValuationStatus =
  | "READY"
  | "MISSING_UNIT_COST"
  | "NOT_APPLICABLE";

export type StockAdjustmentLine = {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string;
  product_name?: string;
  inventory_item_standard_unit_cost?: string | null;
  quantity_delta: string;
  unit_cost_snapshot?: string | null;
  valuation_amount_snapshot?: string | null;
  // Additive, read-only valuation readiness (null = unknown, never ₹0).
  effective_unit_cost?: string | null;
  line_valuation?: string | null;
  valuation_status?: AdjustmentValuationStatus;
  has_standard_cost?: boolean;
  requires_unit_cost?: boolean;
  line_blocker?: string | null;
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
  // Additive, read-only posting readiness.
  can_post?: boolean;
  posting_blockers?: string[];
  valuation_status?: AdjustmentValuationStatus;
  requires_unit_cost?: boolean;
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

export type VendorPayment = {
  id: number;
  payment_no: string;
  payment_date: string;
  vendor: number;
  vendor_name?: string;
  vendor_bill?: number | null;
  vendor_bill_no?: string;
  amount: string;
  status: "DRAFT" | "POSTED" | "CANCELLED";
  reference_no?: string;
};

export type VendorAgreement = {
  id: number;
  agreement_no: string;
  vendor: number;
  vendor_name?: string;
  effective_from: string;
  effective_to?: string | null;
  status: "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";
  payment_terms?: string;
  credit_period_days: number;
  notes?: string;
};

export type PurchaseRequest = {
  id: number;
  request_no: string;
  request_date: string;
  status: "DRAFT" | "APPROVED" | "PARTIALLY_ORDERED" | "ORDERED" | "CANCELLED";
  vendor?: number | null;
  vendor_name?: string;
  notes?: string;
};

export type StockLocationPayload = {
  code: string;
  name: string;
  branch?: number | null;
  location_type: "STORE" | "WAREHOUSE" | "SHOWROOM";
  is_active: boolean;
  notes?: string;
};

export type InventoryProfileRow = {
  id: number;
  inventory_code?: string | null;
  product: number;
  product_name?: string;
  product_code?: string;
  sku?: string | null;
  stock_tracking_enabled: boolean;
  stock_tracking_status: string;
  is_active: boolean;
};

export type InventoryProfileDetail = InventoryProfileRow & {
  product_base_price: string;
  unit_of_measure: string;
  reorder_level_qty: string;
  default_stock_location?: number | null;
  preferred_stock_location?: number | null;
  valuation_method: "FIFO" | "AVG";
  costing_method?: string;
  standard_unit_cost?: string | null;
  purchase_unit_cost?: string | null;
  manufacturing_cost_enabled: boolean;
  manufacturing_raw_material_cost: string;
  manufacturing_labour_cost: string;
  manufacturing_overhead_cost: string;
  manufacturing_finished_goods_output_qty: string;
  margin_preview?: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryProfileStockByLocation = {
  warehouse_qty: string;
  showroom_qty: string;
  total_on_hand_qty: string;
  reserved_qty: string;
  available_qty: string;
  last_movement_date?: string | null;
  locations: Array<{
    stock_location_id?: number | null;
    stock_location_code?: string | null;
    stock_location_name?: string | null;
    stock_location_type?: string | null;
    on_hand_qty: string;
  }>;
};

export type InventoryProfileManufacturingCost = {
  supported: boolean;
  manufacturing_cost_enabled: boolean;
  raw_material_cost: string;
  labour_cost: string;
  overhead_cost: string;
  total_estimated_manufacturing_cost: string;
  finished_goods_output_qty: string;
  bom_id?: number | null;
  bom_no?: string | null;
  bom_lines: Array<{
    bom_line_id: number;
    inventory_item_id: number;
    inventory_item_sku?: string | null;
    inventory_item_name?: string | null;
    required_quantity: string;
    material_unit_cost: string;
    line_estimated_cost: string;
  }>;
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

export function listInventoryProfiles(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<InventoryProfileRow>>(`/admin/inventory/profiles/${buildQuery(params)}`);
}

export function getInventoryProfile(id: number | string) {
  return apiFetch<InventoryProfileDetail>(`/admin/inventory/profiles/${id}/`);
}

export function updateInventoryProfile(id: number | string, payload: Record<string, unknown>) {
  return apiFetch<InventoryProfileDetail>(`/admin/inventory/profiles/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function getInventoryProfileStockByLocation(id: number | string) {
  return apiFetch<InventoryProfileStockByLocation>(`/admin/inventory/profiles/${id}/stock-by-location/`);
}

export function getInventoryProfileManufacturingCost(id: number | string) {
  return apiFetch<InventoryProfileManufacturingCost>(`/admin/inventory/profiles/${id}/manufacturing-cost/`);
}

export function updateInventoryProfileManufacturingCost(id: number | string, payload: Record<string, unknown>) {
  return apiFetch<InventoryProfileManufacturingCost>(`/admin/inventory/profiles/${id}/manufacturing-cost/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type CreateStockAdjustmentPayload = {
  adjustment_no?: string;
  adjustment_date: string;
  reason: string;
  stock_location?: number | null;
  lines: Array<{
    inventory_item: number;
    quantity_delta: string;
    unit_cost_snapshot?: string | null;
    notes?: string;
  }>;
};

export function listInventoryItems(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<InventoryItem>>(`/inventory/items/${buildQuery(params)}`);
}

export function searchAdminInventoryItems(params: { q: string }) {
  return apiFetch<{ count: number; results: AdminInventoryItemSearchRow[] }>(
    `/admin/inventory/items/search/${buildQuery({ q: params.q })}`
  );
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

export function setStockAdjustmentLineCosts(
  id: number,
  unitCosts: Record<string, string | null>
) {
  return apiFetch<{ updated: number; stock_adjustment: StockAdjustment }>(
    `/inventory/stock-adjustments/${id}/set-line-costs/`,
    {
      method: "POST",
      body: JSON.stringify({ unit_costs: unitCosts }),
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

export function listVendorPayments(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<VendorPayment>>(`/inventory/vendor-payments/${buildQuery(params)}`);
}

export function listVendorAgreements(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<VendorAgreement>>(`/inventory/vendor-agreements/${buildQuery(params)}`);
}

export function listPurchaseRequests(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<PurchaseRequest>>(`/inventory/purchase-requests/${buildQuery(params)}`);
}

export function listAdminOpeningStockEntries(params: Record<string, QueryValue> = {}) {
  return apiFetch<PaginatedResponse<OpeningStockEntryRow>>(
    `/admin/inventory/opening-stock/${buildQuery(params)}`
  );
}

export function createAdminOpeningStockEntry(payload: {
  inventory_item: number;
  stock_location: number;
  quantity: string;
  effective_date: string;
  unit_cost_snapshot?: string | null;
  note?: string;
}) {
  return apiFetch<OpeningStockEntryRow>("/admin/inventory/opening-stock/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function patchAdminOpeningStockEntry(
  id: number,
  payload: Partial<{
    inventory_item: number;
    stock_location: number;
    quantity: string;
    effective_date: string;
    unit_cost_snapshot: string | null;
    note: string;
  }>
) {
  return apiFetch<OpeningStockEntryRow>(`/admin/inventory/opening-stock/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function postAdminOpeningStockEntry(id: number) {
  return apiFetch<{ updated: boolean; opening_stock_entry: OpeningStockEntryRow }>(
    `/admin/inventory/opening-stock/${id}/post/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function cancelAdminOpeningStockEntry(id: number) {
  return apiFetch<{ opening_stock_entry: OpeningStockEntryRow }>(
    `/admin/inventory/opening-stock/${id}/cancel/`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function correctionAdminOpeningStockEntry(
  id: number,
  payload: {
    reason: string;
    quantity_delta: string;
    unit_cost_snapshot?: string | null;
    adjustment_date?: string | null;
  }
) {
  return apiFetch<{ stock_adjustment: StockAdjustment }>(
    `/admin/inventory/opening-stock/${id}/correction/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function previewAdminOpeningStockBulkCsv(file: File, defaultEffectiveDate?: string) {
  const form = new FormData();
  form.append("file", file);
  if (defaultEffectiveDate) {
    form.append("default_effective_date", defaultEffectiveDate);
  }
  return apiFetch<OpeningStockBulkPreview>("/admin/inventory/opening-stock/import/preview/", {
    method: "POST",
    body: form,
  });
}

export async function applyAdminOpeningStockBulkCsv(
  file: File,
  opts: {
    dry_run?: boolean;
    auto_post?: boolean;
    default_effective_date?: string | null;
  } = {}
) {
  const form = new FormData();
  form.append("file", file);
  if (opts.dry_run) form.append("dry_run", "true");
  if (opts.auto_post) form.append("auto_post", "true");
  if (opts.default_effective_date) {
    form.append("default_effective_date", opts.default_effective_date);
  }
  return apiFetch<OpeningStockBulkApplySummary>("/admin/inventory/opening-stock/import/apply/", {
    method: "POST",
    body: form,
  });
}

export function listAdminOpeningStockBatches() {
  return apiFetch<{ count: number; results: OpeningStockBatchHistoryRow[] }>(
    "/admin/inventory/opening-stock/batches/"
  );
}

export async function fetchOpeningStockCsvTemplateText(): Promise<string> {
  return apiFetch<string>("/admin/inventory/opening-stock/template/", {
    headers: { Accept: "text/csv, */*" },
  });
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
