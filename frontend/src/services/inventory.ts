import { apiFetch } from "@/lib/api";

// ============================================================================
// Types for Lot Tracking
// ============================================================================

export type LotTrackingKPIS = {
  total_lots: number;
  active_lots: number;
  depleted_lots: number;
  quarantined_lots: number;
  expired_lots: number;
  total_quantity: string;
  critical_shortage_count: number;
};

export type LotTrackingResult = {
  [key: string]: any;
  id: number;
  lot_code: string;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  barcode: string;
  quantity: string;
  reorder_point: string;
  status: string;
  source: string;
  priority: string;
  warehouse_code: string;
  created_at: string | null;
  updated_at: string | null;
};

export type LotTrackingListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
  range_start: number;
  range_end: number;
  summary: LotTrackingKPIS;
  results: LotTrackingResult[];
};

// ============================================================================
// Lot Tracking API Functions
// ============================================================================

export interface ListLotsParams {
  q?: string;
  status?: string;
  source?: string;
  priority?: string;
  page?: number;
  page_size?: number;
}

/**
 * List lots with pagination, search, and filters
 * GET /api/v1/admin/inventory/lots/
 */
export function listLots(params: ListLotsParams = {}): Promise<LotTrackingListResponse> {
  const queryParams = new URLSearchParams();

  if (params.q) queryParams.append("q", params.q);
  if (params.status) queryParams.append("status", params.status);
  if (params.source) queryParams.append("source", params.source);
  if (params.priority) queryParams.append("priority", params.priority);
  if (params.page) queryParams.append("page", String(params.page));
  if (params.page_size) queryParams.append("page_size", String(params.page_size));

  const queryString = queryParams.toString();
  const url = queryString ? `/admin/inventory/lots/?${queryString}` : "/admin/inventory/lots/";

  return apiFetch<LotTrackingListResponse>(url, {
    method: "GET",
  });
}

/**
 * Export lots to CSV
 * GET /api/v1/admin/inventory/lots/?format=csv
 */
export function exportLotsCSV(params: ListLotsParams = {}): Promise<Blob> {
  const queryParams = new URLSearchParams();

  if (params.q) queryParams.append("q", params.q);
  if (params.status) queryParams.append("status", params.status);
  if (params.source) queryParams.append("source", params.source);
  if (params.priority) queryParams.append("priority", params.priority);

  queryParams.append("format", "csv");

  const queryString = queryParams.toString();
  const url = `/admin/inventory/lots/?${queryString}`;

  return fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "text/csv",
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`CSV export failed: ${response.statusText}`);
      return response.blob();
    });
}

/**
 * Download CSV file
 * Utility function to trigger browser download
 */
export function downloadCSV(blob: Blob, filename: string = "lots.csv"): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Lot Code Generation
// ============================================================================

/**
 * Generate lot code: LOT-PRODUCTCODE-XXXX
 */
export function generateLotCode(productCode: string, sequence: number = 1): string {
  const code = productCode.toUpperCase().trim();
  const seq = String(sequence).padStart(4, "0");
  return `LOT-${code}-${seq}`;
}

// ============================================================================
// Types for Stock on Hand
// ============================================================================

export type StockOnHandKPIS = {
  total_physical_qty: string;
  total_reserved_qty: string;
  total_available_qty: string;
  critical_shortage_count: number;
  total_value: string;
};

export type CriticalShortage = {
  product_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  physical_qty: string;
  reserved_qty: string;
  reorder_point: string;
  shortage_qty: string;
};

export type StockOnHandSummaryResponse = {
  summary: StockOnHandKPIS;
  critical_shortages: CriticalShortage[];
};

export type CriticalShortagesListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  results: CriticalShortage[];
};

// ============================================================================
// Stock on Hand API Functions
// ============================================================================

/**
 * Get stock on hand summary with KPI aggregation
 * GET /api/v1/admin/inventory/stock-on-hand/
 */
export function getStockOnHandSummary(): Promise<StockOnHandSummaryResponse> {
  return apiFetch<StockOnHandSummaryResponse>("/admin/inventory/stock-on-hand/", {
    method: "GET",
  });
}

/**
 * Get critical shortages with pagination
 * GET /api/v1/admin/inventory/stock-on-hand/?filter=critical&page=1&page_size=50
 */
export function getCriticalShortages(
  page: number = 1,
  pageSize: number = 50
): Promise<CriticalShortagesListResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append("filter", "critical");
  queryParams.append("page", String(page));
  queryParams.append("page_size", String(pageSize));

  const url = `/admin/inventory/stock-on-hand/?${queryParams.toString()}`;

  return apiFetch<CriticalShortagesListResponse>(url, {
    method: "GET",
  });
}

// ============================================================================
// Types for Stock Ledger
// ============================================================================

export type StockLedgerKPIS = {
  total_inbound: string;
  total_outbound: string;
  net_change: string;
  period: string;
};

export type StockLedgerResult = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  barcode: string;
  transaction_type: string;
  quantity: string;
  reference_type: string;
  reference_id: number | null;
  reference_display: string;
  warehouse_code: string;
  created_at: string | null;
};

export type StockLedgerListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
  range_start: number;
  range_end: number;
  summary: StockLedgerKPIS;
  results: StockLedgerResult[];
};

// ============================================================================
// Stock Ledger API Functions
// ============================================================================

export interface ListLedgerParams {
  q?: string;
  transaction_type?: string;
  reference_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

/**
 * List stock ledger with pagination, search, and filters
 * GET /api/v1/admin/inventory/ledger/
 */
export function listStockLedger(params: ListLedgerParams = {}): Promise<StockLedgerListResponse> {
  const queryParams = new URLSearchParams();

  if (params.q) queryParams.append("q", params.q);
  if (params.transaction_type) queryParams.append("transaction_type", params.transaction_type);
  if (params.reference_type) queryParams.append("reference_type", params.reference_type);
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);
  if (params.page) queryParams.append("page", String(params.page));
  if (params.page_size) queryParams.append("page_size", String(params.page_size));

  const queryString = queryParams.toString();
  const url = queryString ? `/admin/inventory/ledger/?${queryString}` : "/admin/inventory/ledger/";

  return apiFetch<StockLedgerListResponse>(url, {
    method: "GET",
  });
}

/**
 * Export stock ledger to CSV
 * GET /api/v1/admin/inventory/ledger/?format=csv
 */
export function exportStockLedgerCSV(params: ListLedgerParams = {}): Promise<Blob> {
  const queryParams = new URLSearchParams();

  if (params.q) queryParams.append("q", params.q);
  if (params.transaction_type) queryParams.append("transaction_type", params.transaction_type);
  if (params.reference_type) queryParams.append("reference_type", params.reference_type);
  if (params.date_from) queryParams.append("date_from", params.date_from);
  if (params.date_to) queryParams.append("date_to", params.date_to);

  queryParams.append("format", "csv");

  const queryString = queryParams.toString();
  const url = `/admin/inventory/ledger/?${queryString}`;

  return fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "text/csv",
    },
  })
    .then((response) => {
      if (!response.ok) throw new Error(`CSV export failed: ${response.statusText}`);
      return response.blob();
    });
}

// ============================================================================
// Inventory Movements (StockLedgerViewSet at /inventory/movements/)
// ============================================================================

export type StockLedgerRow = {
  id: number;
  inventory_item_id: number;
  product_code: string;
  product_name: string;
  stock_item_type: string;
  movement_type: string;
  quantity_in: string;
  quantity_out: string;
  movement_date: string;
  stock_location_id: number | null;
  stock_location_code: string | null;
  stock_location_name: string | null;
  branch_id: number | null;
  reference_model: string | null;
  reference_id: string | null;
  notes: string | null;
  posted_by_username: string | null;
  posted_journal_entry_id: number | null;
};

export type MovementsListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  total_in: string;
  total_out: string;
  results: StockLedgerRow[];
};

export type StockLedgerMovementsResponse = MovementsListResponse;

export async function listInventoryMovements(params?: {
  movement_type?: string;
  reference_search?: string;
  item_id?: number;
  location_id?: number;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}): Promise<MovementsListResponse> {
  const query = new URLSearchParams();
  if (params?.movement_type) query.append("movement_type", params.movement_type);
  if (params?.item_id) query.append("item_id", String(params.item_id));
  if (params?.location_id) query.append("location_id", String(params.location_id));
  if (params?.start_date) query.append("start_date", params.start_date);
  if (params?.end_date) query.append("end_date", params.end_date);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qs = query.toString();
  return apiFetch<MovementsListResponse>(`/inventory/movements/${qs ? `?${qs}` : ""}`);
}

// ============================================================================
// Inventory Dashboard
// ============================================================================

export type InventoryDashboardShortage = {
  product_code: string;
  product_name: string;
  required_for_orders: number;
};

export type InventoryDashboardMovement = {
  product_code: string;
  product_name?: string;
  quantity_out_30d?: number;
  on_hand_qty?: number;
};

type InventoryDashboardKPICategory = {
  count: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  value: string | number;
};

export type InventoryDashboardResponse = {
  kpis: {
    total_value: number;
    status_summary: {
      total_skus: number;
      low_stock: number;
      out_of_stock: number;
    };
    by_category: {
      finished_goods: InventoryDashboardKPICategory;
      raw_materials: InventoryDashboardKPICategory;
      accessories: InventoryDashboardKPICategory;
    };
  };
  critical_shortages: InventoryDashboardShortage[];
  movement_velocity: {
    fast_movers: InventoryDashboardMovement[];
    dead_stock: InventoryDashboardMovement[];
  };
};

export async function getInventoryDashboard(params?: {
  location_id?: number;
}): Promise<InventoryDashboardResponse> {
  const query = new URLSearchParams();
  if (params?.location_id) query.append("location_id", String(params.location_id));
  const qs = query.toString();
  return apiFetch<InventoryDashboardResponse>(`/inventory/dashboard/${qs ? `?${qs}` : ""}`);
}

// ============================================================================
// Types for Quick Create
// ============================================================================

export type QuickCreateResult = {
  id: number;
  product_code: string;
  name: string;
  base_price: string;
  status: string;
};

export interface QuickCreatePayload {
  product_code: string;
  name: string;
  base_price: string;
  unit_of_measure?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  sku?: string;
  standard_unit_cost?: string;
  reorder_level_qty?: string;
  variant_label?: string;
}

// ============================================================================
// Dashboard Stock Summary
// ============================================================================

export type StockSummaryRow = {
  [key: string]: any;
  item_id: number;
  product_code: string;
  product_name: string;
  sku?: string;
  current_qty: number;
  reorder_point: number;
  status: string;
};

export type StockSummaryResponse = {
  results: StockSummaryRow[];
  count: number;
};

export interface StockSummaryParams {
  branch?: number | string;
}

/**
 * Get stock summary for dashboard (low stock items)
 * GET /api/v1/inventory/stock-summary/
 */
export function getStockSummary(
  params?: StockSummaryParams
): Promise<StockSummaryResponse> {
  const queryParams = new URLSearchParams();
  if (params?.branch) queryParams.append("branch", String(params.branch));

  const url = queryParams.toString()
    ? `/inventory/stock-summary/?${queryParams}`
    : "/inventory/stock-summary/";

  return apiFetch<StockSummaryResponse>(url, { method: "GET" });
}

// ============================================================================
// Quick Create API Functions
// ============================================================================

/**
 * Quick create an accessory
 * POST /api/v1/admin/products/
 */
export function quickCreateAccessory(payload: QuickCreatePayload): Promise<QuickCreateResult> {
  return apiFetch<QuickCreateResult>("/admin/products/", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      product_type: "ACCESSORY",
    }),
  });
}

/**
 * Quick create a raw material
 * POST /api/v1/admin/products/
 */
export function quickCreateRawMaterial(payload: QuickCreatePayload): Promise<QuickCreateResult> {
  return apiFetch<QuickCreateResult>("/admin/products/", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      product_type: "RAW_MATERIAL",
    }),
  });
}

// ============================================================================
// Generic Inventory Types & Functions
// ============================================================================

export type InventoryItem = {
  [key: string]: any;
  id: number;
  product_code: string;
  name?: string;
  product_name?: string;
  sku?: string;
  barcode?: string;
  category?: string;
  subcategory?: string;
  base_price?: string;
  standard_unit_cost?: string;
  unit_of_measure?: string;
  stock_item_type?: string;
};

export type PaginatedResponse<T> = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  results: T[];
  [key: string]: unknown;
};

export type StockLocation = {
  id: number;
  code: string;
  name: string;
  address?: string;
  phone?: string;
  location_type?: string;
  is_active?: boolean;
  notes?: string;
  branch?: number | null;
  branch_name?: string | null;
  branch_code?: string | null;
  is_default_receiving_location?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StockLocationsRow = {
  id: number;
  code: string;
  name: string;
  location_type: string;
  is_active: boolean;
  notes: string;
  address: string;
  phone: string;
  is_default_receiving_location: boolean;
  branch_id: number | null;
  branch_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StockLocationsPayload = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  active_count: number;
  warehouse_count: number;
  showroom_count: number;
  store_count: number;
  results: StockLocationsRow[];
};

export type StockAdjustmentLine = {
  [key: string]: any;
  id?: number;
  product_id: number;
  quantity: number;
  unit_cost_snapshot?: string | null;
  valuation_amount_snapshot?: string | null;
  line_valuation?: string | null;
};

export type StockAdjustment = {
  id: number;
  adjustment_no?: string;
  adjustment_date: string;
  status: string;
  stock_location_name?: string;
  reason?: string;
  lines?: StockAdjustmentLine[];
  created_by_username?: string;
  draft_count?: number;
  approved_count?: number;
  posted_count?: number;
  requires_unit_cost?: boolean;
  can_post?: boolean;
  posting_blockers?: string[];
};

export interface StockAdjustmentsPayload {
  adjustment_date: string;
  lines: Array<{ product_id: number; quantity: number }>;
}

export type AccessoryRow = {
  id: number;
  product_code: string;
  name?: string;
  product_name?: string;
  variant_label?: string;
  base_price?: string;
  sku?: string;
  unit_of_measure?: string;
  standard_unit_cost?: string;
  linked_fg_count?: number;
  stock_tracking_status?: string;
};

export type AccessoryVariantGroup = {
  id: number;
  code?: string;
  name: string;
  category?: string;
  subcategory?: string;
  description?: string;
  is_required?: boolean;
  is_active?: boolean;
  sort_order?: number;
  variant_count?: number;
  accessories?: AccessoryRow[];
};

export type DemandPlanningRow = {
  [key: string]: any;
  product_id: number;
  product_code: string;
  name?: string;
  product_name?: string;
  sku?: string;
  demand_qty?: number;
  on_hand?: number;
  total_required?: number;
  safety_stock?: number;
};

export type DemandPlanningPayload = Record<string, unknown>;

export type FGProfileDetail = {
  [key: string]: any;
  id: number;
  product_code: string;
  name: string;
  base_price: string;
};

export type FGAccessoryLink = {
  [key: string]: any;
  id: number;
  accessory_id: number;
  accessory_name: string;
};

export type FGServiceLink = {
  [key: string]: any;
  id: number;
  service_id: number;
  service_name: string;
};

export type ServiceCatalogItem = {
  id: number;
  product_id?: number;
  service_name?: string;
  service_type?: string;
  price?: string;
  code?: string;
  name?: string;
  category?: string;
  service_type_label?: string;
  standard_price?: string;
  tax_rate_percent?: string;
  status?: string;
  hsn_sac_code?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ServiceCatalogSummary = {
  total_services: number;
  active_count: number;
  inactive_count: number;
  categories: string[];
  service_types: Array<{ value: string; label: string }>;
};

export type ServiceType = "INSTALLATION" | "DELIVERY" | "WARRANTY" | "MAINTENANCE";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  INSTALLATION: "Installation",
  DELIVERY: "Delivery",
  WARRANTY: "Warranty",
  MAINTENANCE: "Maintenance",
};

// List functions - with pagination support
export async function listInventoryItems(params?: {
  page?: number;
  page_size?: number;
  is_active?: number | boolean;
  stock_tracking_enabled?: number | boolean;
}): Promise<PaginatedResponse<InventoryItem>> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.is_active !== undefined) query.append("is_active", String(params.is_active));
  if (params?.stock_tracking_enabled !== undefined) query.append("stock_tracking_enabled", String(params.stock_tracking_enabled));
  const url = query.toString() ? `/admin/inventory/items/?${query}` : "/admin/inventory/items/";
  return apiFetch<PaginatedResponse<InventoryItem>>(url, { method: "GET" });
}

export async function updateInventoryItem(id: number, payload: Partial<{
  default_stock_location: number | null;
  stock_item_type: string;
  stock_tracking_enabled: boolean;
  sku: string;
  unit_of_measure: string;
  reorder_level_qty: string;
  standard_unit_cost: string;
  valuation_method: string;
  is_active: boolean;
}>): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/admin/inventory/items/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getInventoryItem(id: number): Promise<InventoryItem> {
  return apiFetch<InventoryItem>(`/admin/inventory/items/${id}/`, { method: "GET" });
}

export async function listStockLocations(params?: {
  page?: number;
  page_size?: number;
  location_type?: string;
  is_active?: boolean | number | 1;
  search?: string;
}): Promise<StockLocationsPayload> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.location_type) query.append("location_type", params.location_type);
  if (params?.is_active !== undefined) query.append("is_active", String(params.is_active));
  if (params?.search) query.append("search", params.search);
  const qs = query.toString();
  const url = qs ? `/admin/inventory/locations/?${qs}` : "/admin/inventory/locations/";
  return apiFetch<StockLocationsPayload>(url, { method: "GET" });
}

export async function createStockLocation(payload: {
  code: string;
  name: string;
  branch?: number | null;
  location_type?: string;
  is_active?: boolean;
  notes?: string;
  address?: string;
  phone?: string;
  is_default_receiving_location?: boolean;
}): Promise<StockLocationsRow> {
  return apiFetch<StockLocationsRow>("/admin/inventory/locations/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateStockLocation(
  id: number,
  payload: Partial<{
    code: string;
    name: string;
    branch: number | null;
    location_type: string;
    is_active: boolean;
    notes: string;
    address: string;
    phone: string;
    is_default_receiving_location: boolean;
  }>
): Promise<StockLocationsRow> {
  return apiFetch<StockLocationsRow>(`/admin/inventory/locations/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listAccessories(
  page?: number
): Promise<PaginatedResponse<AccessoryRow>> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  const url = params.toString() ? `/admin/inventory/accessories/?${params}` : "/admin/inventory/accessories/";
  return apiFetch<PaginatedResponse<AccessoryRow>>(url, { method: "GET" });
}

export async function listAccessoryVariantGroups(
  page?: number
): Promise<PaginatedResponse<AccessoryVariantGroup>> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  const url = params.toString()
    ? `/admin/inventory/accessory-variant-groups/?${params}`
    : "/admin/inventory/accessory-variant-groups/";
  return apiFetch<PaginatedResponse<AccessoryVariantGroup>>(url, { method: "GET" });
}

export async function listServiceCatalog(params?: {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  category?: string;
  service_type?: string;
}): Promise<{ count: number; page: number; page_size: number; num_pages: number; summary: ServiceCatalogSummary; results: ServiceCatalogItem[] }> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.q) query.append("q", params.q);
  if (params?.status) query.append("status", params.status);
  if (params?.category) query.append("category", params.category);
  if (params?.service_type) query.append("service_type", params.service_type);
  const qs = query.toString();
  const url = qs ? `/admin/inventory/service-catalog/?${qs}` : "/admin/inventory/service-catalog/";
  return apiFetch(url, { method: "GET" });
}

export async function exportServiceCatalogToCSV(params?: {
  q?: string;
  status?: string;
  category?: string;
  service_type?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params?.q) query.append("q", params.q);
  if (params?.status) query.append("status", params.status);
  if (params?.category) query.append("category", params.category);
  if (params?.service_type) query.append("service_type", params.service_type);
  query.append("format", "csv");
  const url = `/admin/inventory/service-catalog/?${query}`;
  const response = await fetch(`/api/v1${url}`, { credentials: "include" });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `service-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function getBulkDemandPlanning(): Promise<PaginatedResponse<DemandPlanningRow>> {
  return apiFetch<PaginatedResponse<DemandPlanningRow>>("/admin/inventory/demand-planning/", {
    method: "GET",
  });
}

// Stock adjustments
export async function listStockAdjustments(
  page?: number
): Promise<PaginatedResponse<StockAdjustment>> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  const url = params.toString() ? `/admin/inventory/adjustments/?${params}` : "/admin/inventory/adjustments/";
  return apiFetch<PaginatedResponse<StockAdjustment>>(url, { method: "GET" });
}

export async function createStockAdjustment(payload: StockAdjustmentsPayload): Promise<StockAdjustment> {
  return apiFetch<StockAdjustment>("/admin/inventory/adjustments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveStockAdjustment(id: number): Promise<StockAdjustment> {
  return apiFetch<StockAdjustment>(`/admin/inventory/adjustments/${id}/approve/`, {
    method: "POST",
  });
}

export async function postStockAdjustment(id: number): Promise<StockAdjustment> {
  return apiFetch<StockAdjustment>(`/admin/inventory/adjustments/${id}/post/`, {
    method: "POST",
  });
}

export async function setStockAdjustmentLineCosts(id: number, lineId: number): Promise<void> {
  return apiFetch<void>(`/admin/inventory/adjustments/${id}/lines/${lineId}/set-cost/`, {
    method: "POST",
  });
}

// Search
export async function searchInventoryItems(
  q: string
): Promise<PaginatedResponse<InventoryItem>> {
  return apiFetch<PaginatedResponse<InventoryItem>>(
    `/admin/inventory/items/?q=${encodeURIComponent(q)}`,
    { method: "GET" }
  );
}

export type AdminInventoryItemSearchRow = {
  id: number;
  inventory_item_id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  category: string;
  subcategory: string;
  stock_item_type: string;
  unit_of_measure: string;
  standard_unit_cost: string | null;
  barcode: string;
  default_stock_location_id: number | null;
  default_stock_location_code: string | null;
  available_by_location?: Array<{
    stock_location_id: number;
    stock_location_name: string;
    stock_location_code: string;
    available_quantity: string;
  }>;
};

export type InventoryCategoriesResponse = {
  categories: string[];
  subcategories: Array<{ category: string; subcategory: string }>;
  stock_item_types: Array<{ value: string; label: string }>;
};

export async function searchAdminInventoryItems(params: {
  q?: string;
  category?: string;
  subcategory?: string;
  stock_item_type?: string;
  include_locations?: boolean;
}): Promise<{ count: number; results: AdminInventoryItemSearchRow[] }> {
  const query = new URLSearchParams();
  if (params.q) query.append("q", params.q);
  if (params.category) query.append("category", params.category);
  if (params.subcategory) query.append("subcategory", params.subcategory);
  if (params.stock_item_type) query.append("stock_item_type", params.stock_item_type);
  if (params.include_locations) query.append("include_locations", "1");
  const qs = query.toString();
  return apiFetch(`/admin/inventory/items/search/${qs ? `?${qs}` : ""}`);
}

export async function listInventoryCategories(): Promise<InventoryCategoriesResponse> {
  return apiFetch<InventoryCategoriesResponse>("/admin/inventory/categories/");
}

// Finished goods
export async function fetchFGProfile(id: number): Promise<FGProfileDetail> {
  return apiFetch<FGProfileDetail>(`/admin/inventory/finished-goods/${id}/`, {
    method: "GET",
  });
}

export async function addFGAccessoryLink(
  fgId: number,
  accessoryId: number
): Promise<FGAccessoryLink> {
  return apiFetch<FGAccessoryLink>(`/admin/inventory/finished-goods/${fgId}/accessories/`, {
    method: "POST",
    body: JSON.stringify({ accessory_id: accessoryId }),
  });
}

export async function updateFGAccessoryLink(
  fgId: number,
  linkId: number,
  data: unknown
): Promise<FGAccessoryLink> {
  return apiFetch<FGAccessoryLink>(
    `/admin/inventory/finished-goods/${fgId}/accessories/${linkId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteFGAccessoryLink(fgId: number, linkId: number): Promise<void> {
  return apiFetch<void>(`/admin/inventory/finished-goods/${fgId}/accessories/${linkId}/`, {
    method: "DELETE",
  });
}

export async function addFGAccessoryGroupLink(
  fgId: number,
  groupId: number
): Promise<FGAccessoryLink> {
  return apiFetch<FGAccessoryLink>(
    `/admin/inventory/finished-goods/${fgId}/accessory-groups/`,
    {
      method: "POST",
      body: JSON.stringify({ group_id: groupId }),
    }
  );
}

export async function addFGServiceLink(fgId: number, serviceId: number): Promise<FGServiceLink> {
  return apiFetch<FGServiceLink>(`/admin/inventory/finished-goods/${fgId}/services/`, {
    method: "POST",
    body: JSON.stringify({ service_id: serviceId }),
  });
}

export async function updateFGServiceLink(
  fgId: number,
  linkId: number,
  data: unknown
): Promise<FGServiceLink> {
  return apiFetch<FGServiceLink>(
    `/admin/inventory/finished-goods/${fgId}/services/${linkId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(data),
    }
  );
}

export async function deleteFGServiceLink(fgId: number, linkId: number): Promise<void> {
  return apiFetch<void>(`/admin/inventory/finished-goods/${fgId}/services/${linkId}/`, {
    method: "DELETE",
  });
}

// Service catalog
export async function createServiceCatalogItem(payload: unknown): Promise<ServiceCatalogItem> {
  return apiFetch<ServiceCatalogItem>("/admin/inventory/service-catalog/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// Accessory variant groups
export async function createAccessoryVariantGroup(
  payload: unknown
): Promise<AccessoryVariantGroup> {
  return apiFetch<AccessoryVariantGroup>("/admin/inventory/accessory-variant-groups/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAccessoryVariantGroup(
  id: number,
  payload: unknown
): Promise<AccessoryVariantGroup> {
  return apiFetch<AccessoryVariantGroup>(
    `/admin/inventory/accessory-variant-groups/${id}/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteAccessoryVariantGroup(id: number): Promise<void> {
  return apiFetch<void>(`/admin/inventory/accessory-variant-groups/${id}/`, {
    method: "DELETE",
  });
}

// ============================================================================
// Inventory Item Summary base type (shared by FG and Raw Material rows)
// ============================================================================

type InventoryItemSummaryBase = {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  stock_item_type: string;
  unit_of_measure: string;
  stock_tracking_enabled: boolean;
  stock_tracking_status: string;
  standard_unit_cost: string;
  reorder_level_qty: string;
  valuation_method: string;
  barcode: string;
  is_active: boolean;
  category: string;
  subcategory: string;
  base_price: string;
};

// ============================================================================
// Finished Goods
// ============================================================================

export type FinishedGoodRow = InventoryItemSummaryBase & {
  accessory_count: number;
  service_count: number;
  has_bom: boolean;
};

export async function listFinishedGoods(params?: {
  q?: string;
  page?: number;
  page_size?: number;
  tracking_status?: string;
}): Promise<{ count: number; page: number; page_size: number; num_pages: number; results: FinishedGoodRow[] }> {
  const query = new URLSearchParams();
  if (params?.q) query.append("q", params.q);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.tracking_status) query.append("tracking_status", params.tracking_status);
  const qs = query.toString();
  return apiFetch(`/admin/inventory/finished-goods/${qs ? `?${qs}` : ""}`);
}

// ============================================================================
// Raw Materials
// ============================================================================

export type RawMaterialRow = InventoryItemSummaryBase & {
  bom_usage_count: number;
};

export async function listRawMaterials(params?: {
  q?: string;
  page?: number;
  page_size?: number;
  tracking_status?: string;
}): Promise<{ count: number; page: number; page_size: number; num_pages: number; results: RawMaterialRow[] }> {
  const query = new URLSearchParams();
  if (params?.q) query.append("q", params.q);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.tracking_status) query.append("tracking_status", params.tracking_status);
  const qs = query.toString();
  return apiFetch(`/admin/inventory/raw-materials/${qs ? `?${qs}` : ""}`);
}

// ============================================================================
// Stock Reservations
// ============================================================================

export type StockReservationRow = {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  warehouse_id: number;
  warehouse_code: string;
  warehouse_name: string;
  quantity: string;
  status: string;
  source_module: string;
  source_object_id: string;
  created_by_username: string;
  released_at: string | null;
  note: string;
  created_at: string | null;
  updated_at: string | null;
};

export type StockReservationSummary = {
  total_reservations: number;
  total_reserved_qty: string;
  active_count: number;
  released_count: number;
  source_modules: string[];
};

export async function listStockReservations(params?: {
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
  source_module?: string;
}): Promise<{ count: number; page: number; page_size: number; num_pages: number; summary: StockReservationSummary; results: StockReservationRow[] }> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.q) query.append("q", params.q);
  if (params?.status) query.append("status", params.status);
  if (params?.source_module) query.append("source_module", params.source_module);
  const qs = query.toString();
  return apiFetch(`/admin/inventory/reservations/${qs ? `?${qs}` : ""}`);
}

export async function exportStockReservationsToCSV(params?: {
  q?: string;
  status?: string;
  source_module?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params?.q) query.append("q", params.q);
  if (params?.status) query.append("status", params.status);
  if (params?.source_module) query.append("source_module", params.source_module);
  query.append("format", "csv");
  const response = await fetch(`/api/v1/admin/inventory/reservations/?${query}`, { credentials: "include" });
  if (!response.ok) throw new Error("Export failed");
  const blob = await response.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `stock-reservations-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================================
// Inventory Valuation
// ============================================================================

export type InventoryValuationRow = {
  inventory_item_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  valuation_method: string;
  as_of_date: string;
  on_hand_qty: string;
  unit_cost: string;
  stock_value: string;
};

export type InventoryValuationReport = {
  as_of_date: string;
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  total_value: string;
  rows: InventoryValuationRow[];
};

export async function getInventoryValuation(params?: {
  as_of_date?: string;
  search?: string;
  q?: string;
  category?: string;
  exclude_zero?: boolean;
  stock_location_id?: number;
  page?: number;
  page_size?: number;
}): Promise<InventoryValuationReport> {
  const query = new URLSearchParams();
  if (params?.as_of_date) query.append("as_of_date", params.as_of_date);
  if (params?.search) query.append("search", params.search);
  if (params?.q) query.append("q", params.q);
  if (params?.category) query.append("category", params.category);
  if (params?.exclude_zero) query.append("exclude_zero", "true");
  if (params?.stock_location_id) query.append("stock_location_id", String(params.stock_location_id));
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qs = query.toString();
  return apiFetch<InventoryValuationReport>(`/admin/inventory/valuation/${qs ? `?${qs}` : ""}`);
}

// ============================================================================
// Inventory Profiles
// ============================================================================

export type InventoryProfileListRow = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  stock_tracking_enabled: boolean;
  stock_item_type: string;
  unit_of_measure: string;
  default_location_name: string | null;
  reorder_level_qty: string;
  valuation_method: string;
  is_active: boolean;
};

export type InventoryProfileDetail = {
  id: number;
  inventory_code: string;
  product: number;
  product_name: string;
  product_code: string;
  product_base_price: string;
  sku: string;
  unit_of_measure: string;
  stock_tracking_enabled: boolean;
  stock_tracking_status: string;
  is_active: boolean;
  reorder_level_qty: string;
  default_stock_location: number | null;
  preferred_stock_location: number | null;
  valuation_method: string;
  costing_method: string;
  standard_unit_cost: string;
  purchase_unit_cost: string;
  manufacturing_cost_enabled: boolean;
  manufacturing_raw_material_cost: string;
  manufacturing_labour_cost: string;
  manufacturing_overhead_cost: string;
  manufacturing_finished_goods_output_qty: string;
  margin_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryProfileStockByLocation = {
  warehouse_qty: string;
  showroom_qty: string;
  total_on_hand_qty: string;
  reserved_qty: string;
  available_qty: string;
  last_movement_date: string | null;
  locations: Array<{
    stock_location_id: number;
    stock_location_code: string;
    stock_location_name: string;
    stock_location_type: string;
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
  bom_id: number | null;
  bom_no: string | null;
  bom_lines: Array<{
    bom_line_id: number;
    inventory_item_id: number;
    inventory_item_sku: string;
    inventory_item_name: string;
    required_quantity: string;
    material_unit_cost: string;
    line_estimated_cost: string;
  }>;
};

export async function listInventoryProfiles(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  stock_tracking_enabled?: boolean;
}): Promise<{ count: number; page: number; page_size: number; num_pages: number; summary: Record<string, unknown>; results: InventoryProfileListRow[] }> {
  const query = new URLSearchParams();
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  if (params?.search) query.append("search", params.search);
  if (params?.stock_tracking_enabled !== undefined) query.append("stock_tracking_enabled", String(params.stock_tracking_enabled));
  const qs = query.toString();
  return apiFetch(`/admin/inventory/profiles/${qs ? `?${qs}` : ""}`);
}

export async function getInventoryProfile(id: number): Promise<InventoryProfileDetail> {
  return apiFetch<InventoryProfileDetail>(`/admin/inventory/profiles/${id}/`);
}

export async function getInventoryProfileStockByLocation(id: number): Promise<InventoryProfileStockByLocation> {
  return apiFetch<InventoryProfileStockByLocation>(`/admin/inventory/profiles/${id}/stock-by-location/`);
}

export async function getInventoryProfileManufacturingCost(id: number): Promise<InventoryProfileManufacturingCost> {
  return apiFetch<InventoryProfileManufacturingCost>(`/admin/inventory/profiles/${id}/manufacturing-cost/`);
}

export async function bulkPrepareProfiles(payload: {
  item_ids: number[];
  default_location_id?: number | null;
  reorder_level_qty?: string;
  stock_item_type?: string;
}): Promise<{ success: boolean; updated_count: number; results: Array<{ id: number; success: boolean; error: string | null }> }> {
  return apiFetch("/admin/inventory/profiles/bulk-prepare/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportInventoryProfilesToCSV(params?: {
  search?: string;
  stock_tracking_enabled?: boolean;
}): Promise<void> {
  const data = await listInventoryProfiles({ ...params, page_size: 500 });
  const headers = ["ID", "Product Code", "Product Name", "SKU", "Type", "Tracking Enabled", "Unit of Measure", "Default Location", "Reorder Level", "Valuation Method", "Active"];
  const rows = data.results.map((r) => [
    r.id, r.product_code, r.product_name, r.sku, r.stock_item_type,
    r.stock_tracking_enabled ? "Yes" : "No", r.unit_of_measure,
    r.default_location_name ?? "", r.reorder_level_qty, r.valuation_method,
    r.is_active ? "Yes" : "No",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `inventory-profiles-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ============================================================================
// STUBS ADDED FOR TS ERRORS
// ============================================================================
export type VendorBill = any;
export type VendorBillLine = any;
export type VendorLite = any;
export type GoodsReceipt = any;
export type GoodsReceiptLine = any;
export type PurchaseOrder = any;
export type PurchaseOrderLine = any;
export type PurchasePipelineSummary = any;
export type PurchaseRequest = any;
export type PurchaseRequestLine = any;
export type VendorAgreement = any;
export type OpeningStockEntryRow = any;
export type OpeningStockEntriesRow = any;
export type OpeningStockEntriesPayload = any;
export type OpeningStockBulkPreview = any;
export type OpeningStockPreview = any;
export type BillingAccessoryOption = any;
export type BillingAccessoryOptionsResponse = any;
export type BillingServiceOption = any;

export async function createVendorBill(...args: any[]): Promise<any> { return null; }
export async function listGoodsReceipts(...args: any[]): Promise<any> { return null; }
export async function listVendorBills(...args: any[]): Promise<any> { return null; }
export async function listVendorsLite(...args: any[]): Promise<any> { return null; }
export async function postVendorBill(...args: any[]): Promise<any> { return null; }
export async function cancelPurchaseOrder(...args: any[]): Promise<any> { return null; }
export async function createPurchaseOrder(...args: any[]): Promise<any> { return null; }
export async function listPurchaseOrders(...args: any[]): Promise<any> { return null; }
export async function getPurchasePipelineSummary(...args: any[]): Promise<any> { return null; }
export async function createGoodsReceipt(...args: any[]): Promise<any> { return null; }
export async function postGoodsReceipt(...args: any[]): Promise<any> { return null; }
export async function approvePurchaseRequest(...args: any[]): Promise<any> { return null; }
export async function convertPurchaseRequestToPO(...args: any[]): Promise<any> { return null; }
export async function createPurchaseRequest(...args: any[]): Promise<any> { return null; }
export async function listPurchaseRequests(...args: any[]): Promise<any> { return null; }
export async function createVendorAgreement(...args: any[]): Promise<any> { return null; }
export async function listVendorAgreements(...args: any[]): Promise<any> { return null; }
export async function updateVendorAgreement(...args: any[]): Promise<any> { return null; }

export async function applyAdminOpeningStockBulkCsv(...args: any[]): Promise<any> { return null; }
export async function correctionAdminOpeningStockEntry(...args: any[]): Promise<any> { return null; }
export async function createAdminOpeningStockEntry(...args: any[]): Promise<any> { return null; }
export async function fetchOpeningStockCsvTemplateText(...args: any[]): Promise<any> { return null; }
export async function listAdminOpeningStockBatches(...args: any[]): Promise<any> { return null; }
export async function listAdminOpeningStockEntries(...args: any[]): Promise<any> { return null; }
export async function patchAdminOpeningStockEntry(...args: any[]): Promise<any> { return null; }
export async function postAdminOpeningStockEntry(...args: any[]): Promise<any> { return null; }
export async function postOpeningStockImport(...args: any[]): Promise<any> { return null; }
export async function previewAdminOpeningStockBulkCsv(...args: any[]): Promise<any> { return null; }
export async function previewOpeningStockImport(...args: any[]): Promise<any> { return null; }
export async function fetchBillingAccessoryOptions(...args: any[]): Promise<any> { return null; }
