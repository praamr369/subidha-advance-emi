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
  id: number;
  lot_code: string;
  product_id: number | null;
  product_name: string;
  product_code: string;
  sku: string;
  barcode: string;
  quantity_on_hand: string;
  status: string;
  source_model: string;
  source_id: string;
  location_name: string;
  location_code: string;
  received_date: string | null;
  expiry_date: string | null;
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
  search?: string;
  status?: string;
  source_model?: string;
  page?: number;
  page_size?: number;
}

/**
 * List lots with pagination, search, and filters
 * GET /api/v1/admin/inventory/lots/
 */
export function listLots(params: ListLotsParams = {}): Promise<LotTrackingListResponse> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append("search", params.search);
  if (params.status) queryParams.append("status", params.status);
  if (params.source_model) queryParams.append("source_model", params.source_model);
  if (params.page) queryParams.append("page", String(params.page));
  if (params.page_size) queryParams.append("page_size", String(params.page_size));

  const queryString = queryParams.toString();
  const url = queryString ? `/admin/inventory/lots/?${queryString}` : "/admin/inventory/lots/";

  return apiFetch<LotTrackingListResponse>(url, { method: "GET" });
}

/**
 * Export lots to CSV
 * GET /api/v1/admin/inventory/lots/?format=csv
 */
export function exportLotsCSV(params: ListLotsParams = {}): Promise<Blob> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append("search", params.search);
  if (params.status) queryParams.append("status", params.status);
  if (params.source_model) queryParams.append("source_model", params.source_model);
  queryParams.append("format", "csv");

  return fetch(`/admin/inventory/lots/?${queryParams.toString()}`, { method: "GET" })
    .then((res) => {
      if (!res.ok) throw new Error(`CSV export failed: ${res.statusText}`);
      return res.blob();
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
  product_id: number | null;
  product_name: string;
  product_code: string;
  sku: string;
  barcode: string;
  movement_type: string;
  quantity_in: string;
  quantity_out: string;
  movement_date: string | null;
  stock_location: string;
  reference_model: string;
  reference_id: number | string | null;
  notes: string;
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
  search?: string;
  movement_type?: string;
  reference_model?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

/**
 * List stock ledger with pagination, search, and filters
 * GET /api/v1/admin/inventory/ledger/
 */
export function listStockLedger(params: ListLedgerParams = {}): Promise<StockLedgerListResponse> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append("search", params.search);
  if (params.movement_type) queryParams.append("movement_type", params.movement_type);
  if (params.reference_model) queryParams.append("reference_model", params.reference_model);
  if (params.start_date) queryParams.append("start_date", params.start_date);
  if (params.end_date) queryParams.append("end_date", params.end_date);
  if (params.page) queryParams.append("page", String(params.page));
  if (params.page_size) queryParams.append("page_size", String(params.page_size));

  const queryString = queryParams.toString();
  const url = queryString ? `/admin/inventory/ledger/?${queryString}` : "/admin/inventory/ledger/";

  return apiFetch<StockLedgerListResponse>(url, { method: "GET" });
}

/**
 * Export stock ledger to CSV
 * GET /api/v1/admin/inventory/ledger/?format=csv
 */
export function exportStockLedgerCSV(params: ListLedgerParams = {}): Promise<Blob> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append("search", params.search);
  if (params.movement_type) queryParams.append("movement_type", params.movement_type);
  if (params.reference_model) queryParams.append("reference_model", params.reference_model);
  if (params.start_date) queryParams.append("start_date", params.start_date);
  if (params.end_date) queryParams.append("end_date", params.end_date);
  queryParams.append("format", "csv");

  return fetch(`/admin/inventory/ledger/?${queryParams.toString()}`, { method: "GET" })
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
  product_id: number | null;
  product_code: string;
  product_name: string;
  sku: string;
  barcode: string;
  movement_type: string;
  quantity_in: string;
  quantity_out: string;
  movement_date: string | null;
  stock_location: string;
  reference_model: string;
  reference_id: number | string | null;
  notes: string;
  created_at: string | null;
};

export type StockLedgerSummary = {
  total_inbound: string;
  total_outbound: string;
  net_change: string;
  period: string;
};

export type MovementsListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
  range_start: number;
  range_end: number;
  summary: StockLedgerSummary;
  results: StockLedgerRow[];
};

export type StockLedgerMovementsResponse = MovementsListResponse;

export async function listInventoryMovements(params?: {
  movement_type?: string;
  reference_model?: string;
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
  if (params?.reference_model) query.append("reference_model", params.reference_model);
  if (params?.item_id) query.append("item_id", String(params.item_id));
  if (params?.location_id) query.append("location_id", String(params.location_id));
  if (params?.start_date) query.append("start_date", params.start_date);
  if (params?.end_date) query.append("end_date", params.end_date);
  if (params?.search) query.append("search", params.search);
  if (params?.page) query.append("page", String(params.page));
  if (params?.page_size) query.append("page_size", String(params.page_size));
  const qs = query.toString();
  return apiFetch<MovementsListResponse>(`/admin/inventory/ledger/${qs ? `?${qs}` : ""}`);
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
  id?: number;
  inventory_item_id?: number;
  inventory_item_sku?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  quantity_delta: string;
  unit_cost_snapshot?: string | null;
  valuation_amount_snapshot?: string | null;
  line_valuation?: string | null;
  requires_unit_cost?: boolean;
  notes?: string | null;
};

export type StockAdjustment = {
  id: number;
  adjustment_no?: string;
  adjustment_date: string;
  status: string;
  stock_location_id?: number | null;
  stock_location_name?: string | null;
  reason?: string;
  lines: StockAdjustmentLine[];
  requires_unit_cost?: boolean;
  can_post?: boolean;
  posting_blockers?: string[];
  created_by_username?: string | null;
  approved_by_username?: string | null;
  posted_by_username?: string | null;
  created_at?: string;
};

export type StockAdjustmentsListResponse = {
  count: number;
  page: number;
  page_size: number;
  num_pages: number;
  draft_count: number;
  approved_count: number;
  posted_count: number;
  results: StockAdjustment[];
};

export interface StockAdjustmentsPayload {
  adjustment_no?: string;
  adjustment_date: string;
  reason: string;
  stock_location?: number | null;
  lines: Array<{
    inventory_item: number;
    quantity_delta: string;
    unit_cost_snapshot?: string;
    notes?: string;
  }>;
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
  physical_qty?: string;
  reorder_level_qty?: string;
};

export type AccessoryVariantGroup = {
  id: number;
  code: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  variant_count: number;
  accessories?: AccessoryRow[];
};

export type DemandPlanningRow = {
  product_id: number;
  product_code: string;
  name?: string;
  product_name?: string;
  sku?: string;
  demand_qty?: number;
  on_hand: string;
  total_required: string;
  safety_stock?: number;
  active_subscriptions?: string | number;
  locked_batch_demand?: string | number;
  winners_pending_delivery?: string | number;
  direct_sale_orders?: string | number;
  rent_lease_commitments?: string | number;
};

export type DemandPlanningPayload = PaginatedResponse<DemandPlanningRow>;

export type FGProfile = {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  sku: string;
  unit_of_measure: string;
  valuation_method: string;
  standard_unit_cost: string;
  base_price: string;
  reorder_level_qty: string;
  stock_tracking_status: string;
  stock_item_type: string;
  category: string;
  subcategory: string;
  barcode: string;
  is_active: boolean;
  physical_qty: string;
};

export type FGBomLine = {
  id: number;
  product_name: string;
  product_code: string;
  item_type: string;
  quantity_per_unit: string;
  wastage_percent: string;
  unit_of_measure: string;
  notes: string;
};

export type FGBom = {
  id: number;
  bom_no: string;
  revision_no: number;
  status: string;
  is_default: boolean;
  lines: FGBomLine[];
};

export type FGProfileDetail = {
  profile: FGProfile;
  accessories: FGAccessoryLink[];
  services: FGServiceLink[];
  bom_count: number;
  active_bom: FGBom | null;
};

export type FGAccessoryLink = {
  id: number;
  accessory: number | null;
  accessory_name: string | null;
  accessory_code: string | null;
  accessory_sku: string | null;
  variant_group: number | null;
  variant_group_name: string | null;
  charge_mode: string;
  sale_price: string;
  is_default_included: boolean;
  sort_order: number;
  notes: string;
};

export type FGServiceLink = {
  id: number;
  service: number;
  service_name: string;
  service_code: string;
  service_type: ServiceType;
  service_category: string;
  service_standard_price: string;
  service_tax_rate_percent: string;
  service_hsn_sac_code: string;
  charge_mode: string;
  sale_price: string;
  is_default_included: boolean;
  sort_order: number;
  notes: string;
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

export type ServiceType = "INSTALLATION" | "DELIVERY" | "WARRANTY" | "MAINTENANCE" | "POLISH" | "REPAIR" | "ADDON" | "OTHER";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  INSTALLATION: "Installation",
  DELIVERY: "Delivery",
  WARRANTY: "Warranty",
  MAINTENANCE: "Maintenance",
  POLISH: "Polish",
  REPAIR: "Repair",
  ADDON: "Add-on",
  OTHER: "Other",
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
  delivery_stock_bridge_enabled: boolean;
  sku: string;
  unit_of_measure: string;
  reorder_level_qty: string;
  standard_unit_cost: string | null;
  valuation_method: string;
  barcode: string | null;
  qr_code: string | null;
  lot_tracking_enabled: boolean;
  expiry_tracking_enabled: boolean;
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
  opts: { q?: string; page?: number; page_size?: number } = {}
): Promise<PaginatedResponse<AccessoryRow>> {
  const params = new URLSearchParams();
  if (opts.q) params.append("q", opts.q);
  if (opts.page) params.append("page", String(opts.page));
  if (opts.page_size) params.append("page_size", String(opts.page_size));
  const url = params.toString() ? `/admin/inventory/accessories/?${params}` : "/admin/inventory/accessories/";
  return apiFetch<PaginatedResponse<AccessoryRow>>(url, { method: "GET" });
}

export async function listAccessoryVariantGroups(
  opts: { q?: string; page?: number; page_size?: number } = {}
): Promise<PaginatedResponse<AccessoryVariantGroup>> {
  const params = new URLSearchParams();
  if (opts.q) params.append("q", opts.q);
  if (opts.page) params.append("page", String(opts.page));
  if (opts.page_size) params.append("page_size", String(opts.page_size));
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

export async function getBulkDemandPlanning(params?: {
  page?: number;
  page_size?: number;
  search?: string;
  critical_shortage?: string;
  demand_sources?: string;
}): Promise<DemandPlanningPayload> {
  const qs = params ? new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString() : "";
  return apiFetch<DemandPlanningPayload>(`/admin/inventory/demand-planning/${qs ? `?${qs}` : ""}`);
}

// Stock adjustments
export async function listStockAdjustments(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<StockAdjustmentsListResponse> {
  const q = new URLSearchParams();
  if (params?.page) q.append("page", String(params.page));
  if (params?.page_size) q.append("page_size", String(params.page_size));
  if (params?.status) q.append("status", params.status);
  if (params?.search) q.append("search", params.search);
  const url = q.toString() ? `/admin/inventory/adjustments/?${q}` : "/admin/inventory/adjustments/";
  return apiFetch<StockAdjustmentsListResponse>(url, { method: "GET" });
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

export async function setStockAdjustmentLineCosts(
  id: number,
  unitCosts: Record<string, string | null>
): Promise<void> {
  return apiFetch<void>(`/admin/inventory/adjustments/${id}/set-line-costs/`, {
    method: "POST",
    body: { unit_costs: unitCosts },
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
  payload: { accessory: number; charge_mode?: string; sale_price?: string; is_default_included?: boolean; sort_order?: number; notes?: string }
): Promise<FGAccessoryLink> {
  return apiFetch<FGAccessoryLink>(`/admin/inventory/finished-goods/${fgId}/accessories/`, {
    method: "POST",
    body: JSON.stringify(payload),
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
  payload: { variant_group: number; charge_mode?: string; sale_price?: string; is_default_included?: boolean; sort_order?: number; notes?: string }
): Promise<FGAccessoryLink> {
  return apiFetch<FGAccessoryLink>(
    `/admin/inventory/finished-goods/${fgId}/accessory-groups/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function addFGServiceLink(
  fgId: number,
  payload: { service: number; charge_mode?: string; sale_price?: string; is_default_included?: boolean; sort_order?: number; notes?: string }
): Promise<FGServiceLink> {
  return apiFetch<FGServiceLink>(`/admin/inventory/finished-goods/${fgId}/services/`, {
    method: "POST",
    body: JSON.stringify(payload),
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

// FG barcode
export async function patchFGBarcode(fgId: number, barcode?: string): Promise<{ barcode: string }> {
  return apiFetch<{ barcode: string }>(`/admin/inventory/finished-goods/${fgId}/barcode/`, {
    method: "PATCH",
    body: JSON.stringify({ barcode: barcode ?? "" }),
  });
}

// Quick-create accessory + link in one call
export type QuickCreateAccessoryPayload = {
  name: string;
  product_code: string;
  base_price?: string;
  unit_of_measure?: string;
  charge_mode?: string;
  sale_price?: string;
  is_default_included?: boolean;
  sort_order?: number;
  notes?: string;
};
export type QuickCreateAccessoryResult = {
  accessory_item_id: number;
  product_code: string;
  name: string;
  link: FGAccessoryLink;
};
export async function quickCreateAndLinkAccessory(
  fgId: number,
  payload: QuickCreateAccessoryPayload
): Promise<QuickCreateAccessoryResult> {
  return apiFetch<QuickCreateAccessoryResult>(
    `/admin/inventory/finished-goods/${fgId}/quick-create-accessory/`,
    { method: "POST", body: JSON.stringify(payload) }
  );
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
  physical_qty: string;
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
  physical_qty: string;
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
}): Promise<Blob> {
  const data = await listInventoryProfiles({ ...params, page_size: 500 });
  const headers = ["ID", "Product Code", "Product Name", "SKU", "Type", "Tracking Enabled", "Unit of Measure", "Default Location", "Reorder Level", "Valuation Method", "Active"];
  const rows = data.results.map((r) => [
    r.id, r.product_code, r.product_name, r.sku, r.stock_item_type,
    r.stock_tracking_enabled ? "Yes" : "No", r.unit_of_measure,
    r.default_location_name ?? "", r.reorder_level_qty, r.valuation_method,
    r.is_active ? "Yes" : "No",
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  return new Blob([csv], { type: "text/csv;charset=utf-8;" });
}

// ============================================================================
// VENDOR TYPES
// ============================================================================
export interface VendorLite {
  id: number;
  name: string;
  phone: string;
  email: string;
  gstin: string | null;
  state_code: string | null;
  state_name: string | null;
  is_active: boolean;
}

// ============================================================================
// PURCHASE ORDER TYPES
// ============================================================================
export type PurchaseOrderStatus =
  | "DRAFT"
  | "SENT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "BILLED"
  | "CANCELLED";

export interface PurchaseOrderLine {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string;
  inventory_item_product_name?: string;
  description?: string;
  quantity: string;
  unit_cost: string;
  tax_amount?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseOrder {
  id: number;
  po_no: string;
  po_date: string;
  vendor: number;
  vendor_name?: string;
  status: PurchaseOrderStatus;
  expected_date?: string | null;
  branch?: number | null;
  stock_location?: number | null;
  stock_location_name?: string | null;
  notes?: string;
  lines: PurchaseOrderLine[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderPayload {
  vendor: number;
  po_date: string;
  expected_date?: string | null;
  notes?: string;
  stock_location?: number | null;
  lines: {
    inventory_item: number;
    description?: string;
    quantity: string;
    unit_cost: string;
    tax_amount?: string;
  }[];
}

// ============================================================================
// PURCHASE REQUEST TYPES
// ============================================================================
export type PurchaseRequestStatus =
  | "DRAFT"
  | "APPROVED"
  | "PARTIALLY_ORDERED"
  | "ORDERED"
  | "CANCELLED";

export interface PurchaseRequestLine {
  id?: number;
  inventory_item: number;
  inventory_item_sku?: string;
  inventory_item_product_name?: string;
  quantity_requested: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseRequest {
  id: number;
  request_no: string;
  request_date: string;
  requested_by?: number | null;
  requested_by_username?: string | null;
  status: PurchaseRequestStatus;
  branch?: number | null;
  stock_location?: number | null;
  stock_location_name?: string | null;
  vendor?: number | null;
  vendor_name?: string | null;
  source_purchase_need?: number | null;
  notes?: string;
  lines: PurchaseRequestLine[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// GOODS RECEIPT TYPES
// ============================================================================
export type GoodsReceiptStatus = "DRAFT" | "RECEIVED" | "CANCELLED";

export interface GoodsReceiptLine {
  id?: number;
  purchase_order_line?: number | null;
  inventory_item: number;
  inventory_item_sku?: string;
  inventory_item_product_name?: string;
  quantity_received: string;
  unit_cost?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GoodsReceipt {
  id: number;
  receipt_no: string;
  receipt_date: string;
  purchase_order: number;
  purchase_order_no?: string | null;
  vendor_name?: string | null;
  status: GoodsReceiptStatus;
  branch?: number | null;
  stock_location?: number | null;
  stock_location_name?: string | null;
  notes?: string;
  allow_over_receive?: boolean;
  over_receive_reason?: string;
  posted_at?: string | null;
  posted_by?: number | null;
  posted_by_username?: string | null;
  lines: GoodsReceiptLine[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// VENDOR BILL TYPES
// ============================================================================
export type VendorBillStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface VendorBillLine {
  id?: number;
  inventory_item?: number | null;
  inventory_item_sku?: string;
  inventory_item_product_name?: string;
  description?: string;
  quantity: string;
  unit_cost: string;
  taxable_value?: string;
  tax_amount?: string;
  line_total?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VendorBill {
  id: number;
  bill_no: string;
  bill_date: string;
  vendor?: number | null;
  vendor_name?: string | null;
  purchase_order?: number | null;
  purchase_order_no?: string | null;
  goods_receipt?: number | null;
  goods_receipt_no?: string | null;
  finance_account?: number | null;
  finance_account_name?: string | null;
  status: VendorBillStatus;
  subtotal?: string;
  tax_total?: string;
  grand_total?: string;
  posted_paid_amount?: string;
  outstanding_amount?: string;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  notes?: string;
  lines: VendorBillLine[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// PURCHASE PIPELINE SUMMARY
// ============================================================================
export interface PurchasePipelineSummary {
  purchase_requests: {
    total: number;
    open: number;
  };
  purchase_orders: {
    total: number;
    draft: number;
    sent: number;
    partially_received: number;
    received: number;
    billed: number;
    awaiting_receipt: number;
    open_value: string;
  };
  goods_receipts: {
    received: number;
    unbilled: number;
  };
  vendor_bills: {
    draft: number;
    posted: number;
    posted_value: string;
  };
  vendor_payments: {
    paid_value: string;
    outstanding_payable: string;
  };
}

// ============================================================================
// VENDOR AGREEMENT TYPES
// ============================================================================
export type VendorAgreementStatus = "DRAFT" | "ACTIVE" | "EXPIRED" | "TERMINATED";

export interface VendorAgreement {
  id: number;
  agreement_no: string;
  vendor: number;
  vendor_name?: string;
  effective_from: string;
  effective_to?: string | null;
  status: VendorAgreementStatus;
  payment_terms?: string;
  credit_period_days?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// OPENING STOCK TYPES (stubs — used by opening-stock pages)
// ============================================================================
export interface OpeningStockEntryRow {
  id: number;
  inventory_item: number;
  stock_location: number;
  quantity: string;
  effective_date: string;
  unit_cost_snapshot?: string | null;
  status: string;
}

export interface OpeningStockEntriesRow {
  id: number;
  inventory_item_id?: number;
  inventory_item_sku?: string;
  product_name?: string;
  product_code?: string;
  stock_location_id: number;
  stock_location_name?: string;
  opening_qty: string;
  unit_cost_snapshot?: string | null;
  effective_date?: string;
  status: string;
}

export interface OpeningStockEntriesPayload {
  results: OpeningStockEntriesRow[];
  count: number;
  num_pages: number;
  draft_count: number;
  posted_count: number;
}

export interface OpeningStockBulkPreviewRow {
  row: number;
  sku?: string;
  product_code?: string;
  quantity?: string;
  unit_cost?: string;
  update_mode?: string;
  action: string;
  message?: string;
}

export interface OpeningStockBulkPreview {
  ready_rows: number;
  error_rows: number;
  warning_rows: number;
  total_quantity_preview: string | number;
  total_valuation_preview: string | number;
  batch_key: string;
  rows?: OpeningStockBulkPreviewRow[];
}

export interface OpeningStockPreview {
  ready_rows: number;
  error_rows: number;
}

export interface OpeningStockBatch {
  batch_key: string;
  original_filename?: string;
  created_at: string;
  created_by_username?: string;
}

export interface OpeningStockBatchListResponse {
  results: OpeningStockBatch[];
}

export interface OpeningStockBulkApplyResult {
  batch_key: string;
  created: number;
  updated: number;
  posted: number;
  corrections_created: number;
  skipped: number;
  failed: number;
  dry_run: boolean;
}

export interface OpeningStockEntryPayload {
  inventory_item: number;
  stock_location: number;
  quantity: string;
  effective_date: string;
  note?: string;
  unit_cost_snapshot?: string | null;
}

// ============================================================================
// BILLING OPTION TYPES (stubs — used by billing pages)
// ============================================================================
export type BillingAccessoryOption = Record<string, unknown>;
export type BillingAccessoryOptionsResponse = Record<string, unknown>;
export type BillingServiceOption = Record<string, unknown>;

// ============================================================================
// VENDOR FUNCTIONS
// ============================================================================
export async function listVendorsLite(params?: {
  page_size?: number;
  is_active?: boolean;
}): Promise<PaginatedResponse<VendorLite>> {
  const q = new URLSearchParams();
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
  const url = q.toString() ? `/inventory/vendors/?${q}` : "/inventory/vendors/";
  return apiFetch<PaginatedResponse<VendorLite>>(url);
}

// ============================================================================
// PURCHASE ORDER FUNCTIONS
// ============================================================================
export async function listPurchaseOrders(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<PurchaseOrder>> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const url = q.toString() ? `/inventory/purchase-orders/?${q}` : "/inventory/purchase-orders/";
  return apiFetch<PaginatedResponse<PurchaseOrder>>(url);
}

export async function createPurchaseOrder(payload: PurchaseOrderPayload): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>("/inventory/purchase-orders/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelPurchaseOrder(id: number): Promise<{ updated: boolean; purchase_order: PurchaseOrder }> {
  return apiFetch<{ updated: boolean; purchase_order: PurchaseOrder }>(
    `/inventory/purchase-orders/${id}/cancel/`,
    { method: "POST" }
  );
}

// ============================================================================
// PURCHASE REQUEST FUNCTIONS
// ============================================================================
export async function listPurchaseRequests(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<PurchaseRequest>> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const url = q.toString() ? `/inventory/purchase-requests/?${q}` : "/inventory/purchase-requests/";
  return apiFetch<PaginatedResponse<PurchaseRequest>>(url);
}

export interface PurchaseRequestCreatePayload {
  request_date: string;
  vendor?: number | null;
  notes?: string;
  lines: {
    inventory_item: number;
    quantity_requested: string;
    notes?: string;
  }[];
}

export async function createPurchaseRequest(payload: PurchaseRequestCreatePayload): Promise<PurchaseRequest> {
  return apiFetch<PurchaseRequest>("/inventory/purchase-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approvePurchaseRequest(id: number): Promise<{ updated: boolean; purchase_request: PurchaseRequest }> {
  return apiFetch<{ updated: boolean; purchase_request: PurchaseRequest }>(
    `/inventory/purchase-requests/${id}/approve/`,
    { method: "POST" }
  );
}

export async function convertPurchaseRequestToPO(
  id: number,
  payload?: { po_date?: string; expected_date?: string }
): Promise<{ purchase_order: PurchaseOrder; purchase_request: PurchaseRequest }> {
  return apiFetch<{ purchase_order: PurchaseOrder; purchase_request: PurchaseRequest }>(
    `/inventory/purchase-requests/${id}/convert-to-po/`,
    { method: "POST", body: (payload ?? {}) as Record<string, unknown> }
  );
}

// ============================================================================
// GOODS RECEIPT FUNCTIONS
// ============================================================================
export async function listGoodsReceipts(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<GoodsReceipt>> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const url = q.toString() ? `/inventory/goods-receipts/?${q}` : "/inventory/goods-receipts/";
  return apiFetch<PaginatedResponse<GoodsReceipt>>(url);
}

export interface GoodsReceiptCreatePayload {
  purchase_order: number;
  receipt_date: string;
  notes?: string;
  lines: {
    purchase_order_line?: number;
    inventory_item: number;
    quantity_received: string;
    unit_cost?: string;
    notes?: string;
  }[];
}

export async function createGoodsReceipt(payload: GoodsReceiptCreatePayload): Promise<GoodsReceipt> {
  return apiFetch<GoodsReceipt>("/inventory/goods-receipts/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postGoodsReceipt(id: number): Promise<{ updated: boolean; goods_receipt: GoodsReceipt }> {
  return apiFetch<{ updated: boolean; goods_receipt: GoodsReceipt }>(
    `/inventory/goods-receipts/${id}/post/`,
    { method: "POST" }
  );
}

// ============================================================================
// VENDOR BILL FUNCTIONS
// ============================================================================
export async function listVendorBills(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<VendorBill>> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const url = q.toString() ? `/inventory/vendor-bills/?${q}` : "/inventory/vendor-bills/";
  return apiFetch<PaginatedResponse<VendorBill>>(url);
}

export interface VendorBillCreatePayload {
  bill_no?: string;
  bill_date: string;
  vendor: number;
  goods_receipt?: number | null;
  notes?: string;
  lines: {
    inventory_item: number;
    quantity: string;
    unit_cost: string;
    tax_amount?: string;
  }[];
}

export async function createVendorBill(payload: VendorBillCreatePayload): Promise<VendorBill> {
  return apiFetch<VendorBill>("/inventory/vendor-bills/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postVendorBill(id: number): Promise<{ updated: boolean; vendor_bill: VendorBill }> {
  return apiFetch<{ updated: boolean; vendor_bill: VendorBill }>(
    `/inventory/vendor-bills/${id}/post/`,
    { method: "POST" }
  );
}

// ============================================================================
// PURCHASE PIPELINE SUMMARY
// ============================================================================
export async function getPurchasePipelineSummary(): Promise<PurchasePipelineSummary> {
  return apiFetch<PurchasePipelineSummary>("/inventory/purchase-pipeline-summary/");
}

// ============================================================================
// VENDOR AGREEMENT FUNCTIONS
// ============================================================================
export async function listVendorAgreements(params?: {
  vendor?: number;
  page?: number;
}): Promise<PaginatedResponse<VendorAgreement>> {
  const q = new URLSearchParams();
  if (params?.vendor) q.set("vendor", String(params.vendor));
  if (params?.page) q.set("page", String(params.page));
  const url = q.toString() ? `/inventory/vendor-agreements/?${q}` : "/inventory/vendor-agreements/";
  return apiFetch<PaginatedResponse<VendorAgreement>>(url);
}

export interface VendorAgreementPayload {
  vendor: number;
  effective_from: string;
  effective_to?: string | null;
  status?: VendorAgreementStatus;
  payment_terms?: string;
  credit_period_days?: number;
  notes?: string;
}

export async function createVendorAgreement(payload: VendorAgreementPayload): Promise<VendorAgreement> {
  return apiFetch<VendorAgreement>("/inventory/vendor-agreements/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateVendorAgreement(id: number, payload: VendorAgreementPayload): Promise<VendorAgreement> {
  return apiFetch<VendorAgreement>(`/inventory/vendor-agreements/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// ============================================================================
// VENDOR PAYMENT TYPES + FUNCTIONS
// ============================================================================
export type VendorPaymentStatus = "DRAFT" | "POSTED" | "CANCELLED";

export interface VendorPayment {
  id: number;
  payment_no: string;
  payment_date: string;
  vendor: number;
  vendor_name?: string;
  vendor_bill?: number | null;
  vendor_bill_no?: string | null;
  amount: string;
  finance_account: number;
  finance_account_name?: string;
  status: VendorPaymentStatus;
  posted_journal_entry?: number | null;
  posted_journal_entry_no?: string | null;
  reference_no?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface VendorPaymentPayload {
  vendor: number;
  payment_date: string;
  vendor_bill?: number | null;
  amount: string;
  finance_account: number;
  reference_no?: string;
  notes?: string;
}

export async function listVendorPayments(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<VendorPayment>> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.page_size) q.set("page_size", String(params.page_size));
  if (params?.status) q.set("status", params.status);
  if (params?.search) q.set("search", params.search);
  const url = q.toString() ? `/inventory/vendor-payments/?${q}` : "/inventory/vendor-payments/";
  return apiFetch<PaginatedResponse<VendorPayment>>(url);
}

export async function createVendorPayment(payload: VendorPaymentPayload): Promise<VendorPayment> {
  return apiFetch<VendorPayment>("/inventory/vendor-payments/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function postVendorPayment(id: number): Promise<{ updated: boolean; vendor_payment: VendorPayment }> {
  return apiFetch<{ updated: boolean; vendor_payment: VendorPayment }>(
    `/inventory/vendor-payments/${id}/post/`,
    { method: "POST" }
  );
}

// OPENING STOCK / BILLING STUBS (implementations live in other pages)
// ============================================================================
export async function applyAdminOpeningStockBulkCsv(_file: File, _opts: { dry_run: boolean; auto_post: boolean; default_effective_date: string }): Promise<OpeningStockBulkApplyResult> { return null as unknown as OpeningStockBulkApplyResult; }
export async function correctionAdminOpeningStockEntry(_id: number, _payload: { reason: string; quantity_delta: string }): Promise<void> { return; }
export async function createAdminOpeningStockEntry(_payload: OpeningStockEntryPayload): Promise<OpeningStockEntriesRow> { return null as unknown as OpeningStockEntriesRow; }
export async function fetchOpeningStockCsvTemplateText(): Promise<string> { return ""; }
export async function listAdminOpeningStockBatches(): Promise<OpeningStockBatchListResponse> { return { results: [] }; }
export async function listAdminOpeningStockEntries(_params: { page?: number; page_size?: number; status?: string; search?: string }): Promise<OpeningStockEntriesPayload> { return null as unknown as OpeningStockEntriesPayload; }
export async function patchAdminOpeningStockEntry(_id: number, _payload: Partial<OpeningStockEntryPayload>): Promise<OpeningStockEntriesRow> { return null as unknown as OpeningStockEntriesRow; }
export async function postAdminOpeningStockEntry(_id: number): Promise<OpeningStockEntriesRow> { return null as unknown as OpeningStockEntriesRow; }
export async function postOpeningStockImport(_file: File, _date: string): Promise<void> { return; }
export async function previewAdminOpeningStockBulkCsv(_file: File, _defaultDate: string): Promise<OpeningStockBulkPreview> { return null as unknown as OpeningStockBulkPreview; }
export async function previewOpeningStockImport(_file: File): Promise<OpeningStockPreview> { return null as unknown as OpeningStockPreview; }
export async function fetchBillingAccessoryOptions(...args: any[]): Promise<any> { return null; }
