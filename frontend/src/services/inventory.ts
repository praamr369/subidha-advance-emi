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
};

export type StockAdjustment = {
  id: number;
  adjustment_no?: string;
  adjustment_date: string;
  status: string;
  stock_location_name?: string;
  reason?: string;
  lines?: Array<{ product_id: number; quantity: number; unit_cost_snapshot?: string }>;
  created_by_username?: string;
  draft_count?: number;
  approved_count?: number;
  posted_count?: number;
  requires_unit_cost?: boolean;
  can_post?: boolean;
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
  id: number;
  product_code: string;
  name: string;
  base_price: string;
};

export type FGAccessoryLink = {
  id: number;
  accessory_id: number;
  accessory_name: string;
};

export type FGServiceLink = {
  id: number;
  service_id: number;
  service_name: string;
};

export type ServiceCatalogItem = {
  id: number;
  product_id: number;
  service_name: string;
  service_type: string;
  price: string;
};

export type ServiceType = "INSTALLATION" | "DELIVERY" | "WARRANTY" | "MAINTENANCE";

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  INSTALLATION: "Installation",
  DELIVERY: "Delivery",
  WARRANTY: "Warranty",
  MAINTENANCE: "Maintenance",
};

// List functions - with pagination support
export async function listInventoryItems(
  page?: number,
  pageSize?: number
): Promise<PaginatedResponse<InventoryItem>> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  if (pageSize) params.append("page_size", String(pageSize));
  const url = params.toString() ? `/admin/inventory/items/?${params}` : "/admin/inventory/items/";
  return apiFetch<PaginatedResponse<InventoryItem>>(url, { method: "GET" });
}

export async function listStockLocations(
  page?: number
): Promise<PaginatedResponse<StockLocation>> {
  const params = new URLSearchParams();
  if (page) params.append("page", String(page));
  const url = params.toString() ? `/admin/inventory/locations/?${params}` : "/admin/inventory/locations/";
  return apiFetch<PaginatedResponse<StockLocation>>(url, { method: "GET" });
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

export async function listServiceCatalog(): Promise<PaginatedResponse<ServiceCatalogItem>> {
  return apiFetch<PaginatedResponse<ServiceCatalogItem>>("/admin/inventory/service-catalog/", {
    method: "GET",
  });
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
