import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";
import { resolveApiMediaUrl } from "@/lib/media";

export type ProductRecord = {
  id: number;
  name: string;
  product_code?: string;
  base_price?: string;
  sku?: string | null;
  unit_of_measure_master?: number | null;
  unit_of_measure_master_name?: string | null;
  unit_of_measure?: string;
  category_master?: number | null;
  category_master_name?: string | null;
  subcategory_master?: number | null;
  subcategory_master_name?: string | null;
  category?: string;
  subcategory?: string;
  description?: string;
  hsn_sac_code?: string | null;
  gst_rate?: string | number | null;
  image?: string | null;
  is_active?: boolean;
  plan_type_default?: "EMI" | "RENT" | "LEASE" | string | null;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: "ACTIVE" | "UPCOMING" | "DISCONTINUED" | "MAINTENANCE" | string;
  is_rent_ready?: boolean;
  is_lease_ready?: boolean;
  inventory_profile_id?: number | null;
  inventory_ready?: boolean;
  inventory_stock_tracking_enabled?: boolean;
  inventory_delivery_stock_bridge_enabled?: boolean;
  readiness_badges?: string[];
  missing_fields?: string[];
  next_actions?: string[];
  created_at?: string;
  updated_at?: string;
};

export type ProductListParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  unit_of_measure?: string;
  is_active?: boolean | string;
  active?: string;
  inventory?: string;
  image_status?: string;
  capability?: string;
  readiness?: string;
  page?: number;
  page_size?: number;
};

export type ProductRegisterSummary = {
  total_products: number;
  inventory_ready: number;
  stock_profile_pending: number;
  subscription_ready: number;
  direct_sale_ready: number;
  rent_lease_ready: number;
  image_missing: number;
  catalog_cleanup_required: number;
  total_base_value: string;
};

export type ProductRegisterPage = {
  count: number;
  total_count: number;
  catalog_total_count: number;
  page: number;
  page_size: number;
  page_size_options: number[];
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
  range_start: number;
  range_end: number;
  summary: ProductRegisterSummary;
  results: ProductRecord[];
};

export type ProductCatalogOptions = {
  categories: { id: number; name: string; description?: string; is_active?: boolean }[];
  subcategories: { id: number; name: string; category_id: number; category_name: string; description?: string; is_active?: boolean }[];
  unit_of_measure_masters: { id: number; code: string; name: string }[];
  unit_of_measure_options: string[];
};

export type ProductCategoryMasterRecord = {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
};

export type ProductSubcategoryMasterRecord = {
  id: number;
  category: number;
  category_name?: string;
  name: string;
  description?: string;
  is_active: boolean;
};

export type ProductUnitOfMeasureMasterRecord = {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
};

export type ProductStockStatus = {
  product_id: number;
  physical_stock: string;
  reserved_stock: string;
  available_stock: string;
  low_stock_threshold: string;
  total_demand: string;
  shortage: string;
  has_shortage: boolean;
  stock_status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "FULLY_RESERVED";
  demand_detail?: Record<string, number>;
};

export type ProductInventoryProfilePreparePayload = {
  default_stock_location?: number | null;
  stock_tracking_enabled?: boolean;
  opening_stock_qty?: string;
  confirm_opening_stock?: boolean;
};

export type ProductInventoryProfilePrepareResponse = {
  created: boolean;
  inventory_profile_id?: number;
  inventory_ready?: boolean;
  readiness_badges?: string[];
  missing_fields?: string[];
  next_actions?: string[];
  stock_ledger_created?: boolean;
  historical_snapshots_preserved?: boolean;
  inventory_profile: {
    id: number;
    product: number;
    product_code?: string;
    product_name?: string;
    sku?: string | null;
    unit_of_measure: string;
    stock_tracking_enabled: boolean;
    delivery_stock_bridge_enabled?: boolean;
    stock_tracking_status?: string;
    default_stock_location?: number | null;
    default_stock_location_code?: string | null;
    default_stock_location_name?: string | null;
    is_active: boolean;
    current_stock_qty?: string;
  };
};

export type CreateOrUpdateProductPayload = Record<string, unknown> | FormData;

function normalizeProductRecord(product: ProductRecord): ProductRecord {
  return {
    ...product,
    image: resolveApiMediaUrl(product.image),
  };
}

function buildQuery(params?: ProductListParams): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value).trim());
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listProductRegister(params?: ProductListParams): Promise<ProductRegisterPage> {
  const payload = await request<ProductRegisterPage>(`/admin/products/register/${buildQuery(params)}`);
  return {
    ...payload,
    count: Number(payload.count || 0),
    total_count: Number(payload.total_count ?? payload.count ?? 0),
    catalog_total_count: Number(payload.catalog_total_count ?? payload.count ?? 0),
    page: Number(payload.page || params?.page || 1),
    page_size: Number(payload.page_size || params?.page_size || 50),
    page_size_options: payload.page_size_options || [20, 50, 100],
    num_pages: Number(payload.num_pages || 0),
    has_next: Boolean(payload.has_next),
    has_previous: Boolean(payload.has_previous),
    range_start: Number(payload.range_start || 0),
    range_end: Number(payload.range_end || 0),
    summary: payload.summary || {
      total_products: Number(payload.count || 0),
      inventory_ready: 0,
      stock_profile_pending: 0,
      subscription_ready: 0,
      direct_sale_ready: 0,
      rent_lease_ready: 0,
      image_missing: 0,
      catalog_cleanup_required: 0,
      total_base_value: "0.00",
    },
    results: (payload.results || []).map((product) => normalizeProductRecord(product)),
  };
}

export async function listProducts(params?: ProductListParams): Promise<ProductRecord[]> {
  const payload = await request(`/admin/products/${buildQuery(params)}`);
  return toResultsArray<ProductRecord>(payload).map((product) => normalizeProductRecord(product));
}

export async function getProductCatalogOptions(): Promise<ProductCatalogOptions> {
  return request<ProductCatalogOptions>("/admin/products/catalog-options/");
}

export async function listProductCategoryMasters(): Promise<ProductCategoryMasterRecord[]> {
  const payload = await request("/admin/product-categories/");
  return toResultsArray<ProductCategoryMasterRecord>(payload);
}

export async function createProductCategoryMaster(payload: Pick<ProductCategoryMasterRecord, "name"> & Partial<Pick<ProductCategoryMasterRecord, "description" | "is_active">>): Promise<ProductCategoryMasterRecord> {
  return request<ProductCategoryMasterRecord>("/admin/product-categories/", { method: "POST", body: JSON.stringify(payload), retryCount: 0 });
}

export async function listProductSubcategoryMasters(params?: { category?: number | string }): Promise<ProductSubcategoryMasterRecord[]> {
  const search = new URLSearchParams();
  if (params?.category) search.set("category", String(params.category));
  const query = search.toString();
  const payload = await request(`/admin/product-subcategories/${query ? `?${query}` : ""}`);
  return toResultsArray<ProductSubcategoryMasterRecord>(payload);
}

export async function createProductSubcategoryMaster(payload: Pick<ProductSubcategoryMasterRecord, "category" | "name"> & Partial<Pick<ProductSubcategoryMasterRecord, "description" | "is_active">>): Promise<ProductSubcategoryMasterRecord> {
  return request<ProductSubcategoryMasterRecord>("/admin/product-subcategories/", { method: "POST", body: JSON.stringify(payload), retryCount: 0 });
}

export async function listProductUnitMasters(): Promise<ProductUnitOfMeasureMasterRecord[]> {
  const payload = await request("/admin/product-units/");
  return toResultsArray<ProductUnitOfMeasureMasterRecord>(payload);
}

export async function createProductUnitMaster(payload: Pick<ProductUnitOfMeasureMasterRecord, "code" | "name"> & Partial<Pick<ProductUnitOfMeasureMasterRecord, "description" | "is_active">>): Promise<ProductUnitOfMeasureMasterRecord> {
  return request<ProductUnitOfMeasureMasterRecord>("/admin/product-units/", { method: "POST", body: JSON.stringify(payload), retryCount: 0 });
}

export async function getProduct(id: number | string): Promise<ProductRecord> {
  const payload = await request<ProductRecord>(`/admin/products/${id}/`);
  return normalizeProductRecord(payload);
}

export async function createProduct(payload: CreateOrUpdateProductPayload): Promise<ProductRecord> {
  const result = await request<ProductRecord>("/admin/products/", { method: "POST", body: payload instanceof FormData ? payload : JSON.stringify(payload), retryCount: 0 });
  return normalizeProductRecord(result);
}

export async function updateProduct(id: number | string, payload: CreateOrUpdateProductPayload): Promise<ProductRecord> {
  const result = await request<ProductRecord>(`/admin/products/${id}/`, { method: "PATCH", body: payload instanceof FormData ? payload : JSON.stringify(payload), retryCount: 0 });
  return normalizeProductRecord(result);
}

export async function prepareProductInventoryProfile(id: number | string, payload: ProductInventoryProfilePreparePayload = {}): Promise<ProductInventoryProfilePrepareResponse> {
  return request<ProductInventoryProfilePrepareResponse>(`/admin/products/${id}/prepare-inventory-profile/`, { method: "POST", body: JSON.stringify(payload), retryCount: 0 });
}

export async function getProductStockStatus(productId: number): Promise<ProductStockStatus> {
  return request<ProductStockStatus>(`/inventory/products/${productId}/stock-status/`);
}
