import { request } from "@/services/api";

export interface PimCategory {
  id: number;
  name: string;
  slug: string;
  icon: string;
  display_order: number;
  subcategories: PimSubcategory[];
  attributes: PimCategoryAttribute[];
}

export interface PimSubcategory {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  attributes: PimCategoryAttribute[];
}

export interface PimCategoryAttribute {
  id: number;
  name: string;
  slug: string;
  data_type: "TEXT" | "NUMBER" | "DECIMAL" | "CHOICE" | "MULTI_CHOICE" | "BOOLEAN" | "DATE";
  is_required: boolean;
  is_variant_defining: boolean;
  min_value: string | null;
  max_value: string | null;
  display_order: number;
  options: PimAttributeOption[];
}

export interface PimAttributeOption {
  id: number;
  value: string;
  display_name: string;
  display_order: number;
}

export interface PimProductAttribute {
  id?: number;
  attribute: number;
  attribute_name: string;
  attribute_slug: string;
  data_type: string;
  value_text: string;
  value_number: string | null;
  value_boolean: boolean | null;
  value_date: string | null;
  display_value: string;
}

export interface PimVariantAttributeValue {
  id?: number;
  attribute: number;
  attribute_name: string;
  attribute_slug: string;
  value_text: string;
  value_number: string | null;
  value_boolean: boolean | null;
}

export interface PimVariant {
  id: number;
  sku: string;
  barcode: string | null;
  price: string;
  cost_price: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  is_active: boolean;
  attribute_values: PimVariantAttributeValue[];
  is_low_stock: boolean;
  variant_label: string;
}

export interface PimProduct {
  id: number;
  code: string;
  name: string;
  description: string;
  category: number;
  category_name: string;
  subcategory: number | null;
  subcategory_name: string | null;
  base_price: string;
  cost_price: string | null;
  is_active: boolean;
  is_published: boolean;
  variant_count?: number;
  attributes?: PimProductAttribute[];
  variants?: PimVariant[];
  created_at?: string;
  updated_at?: string;
}

export interface PimProductCreatePayload {
  code: string;
  name: string;
  description?: string;
  category: number;
  subcategory?: number | null;
  base_price: string;
  cost_price?: string;
  is_active?: boolean;
  is_published?: boolean;
  attributes?: {
    attribute: number;
    value_text?: string;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_date?: string | null;
  }[];
}

export interface PimListResponse<T> {
  results?: T[];
  count?: number;
}

export interface RegisterStatusItem {
  id: number;
  product_code: string;
  name: string;
  category: string;
  subcategory: string;
  base_price: string;
  is_active: boolean;
  item_type: string;
  stock_type: string;
  pim_product_id: number | null;
  pim_synced: boolean;
}

export interface RegisterStatusResponse {
  total_register: number;
  total_pim: number;
  synced_count: number;
  not_synced_count: number;
  count: number;
  results: RegisterStatusItem[];
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { code: string; error: string }[];
  total_processed: number;
}

const BASE = "/api/v1/pim";

// DRF global pagination wraps lists in {count, results}. Unwrap safely.
type PaginatedOrArray<T> = { results?: T[]; count?: number } | T[];
function unwrap<T>(raw: PaginatedOrArray<T>): T[] {
  if (Array.isArray(raw)) return raw;
  return raw.results ?? [];
}

export const pimService = {
  // Categories
  getCategories: (): Promise<PimCategory[]> =>
    request<PaginatedOrArray<PimCategory>>(`${BASE}/categories/?page_size=200`).then(unwrap),

  getCategoryWithAttributes: (id: number): Promise<PimCategory> =>
    request<PimCategory>(`${BASE}/categories/${id}/with_attributes/`),

  // Subcategories
  getSubcategories: (categoryId?: number): Promise<PimSubcategory[]> => {
    const params = categoryId ? `?category=${categoryId}&page_size=200` : "?page_size=200";
    return request<PaginatedOrArray<PimSubcategory>>(`${BASE}/subcategories/${params}`).then(unwrap);
  },

  // Attributes
  getAttributes: (categoryId?: number, subcategoryId?: number): Promise<PimCategoryAttribute[]> => {
    const params = new URLSearchParams();
    params.set("page_size", "500");
    if (categoryId) params.set("category", String(categoryId));
    if (subcategoryId) params.set("subcategory", String(subcategoryId));
    return request<PaginatedOrArray<PimCategoryAttribute>>(`${BASE}/attributes/?${params}`).then(unwrap);
  },

  // Products
  getProducts: (filters?: {
    category?: number;
    subcategory?: number;
    search?: string;
    is_published?: boolean;
  }): Promise<PimProduct[]> => {
    const params = new URLSearchParams();
    params.set("page_size", "200");
    if (filters?.category) params.set("category", String(filters.category));
    if (filters?.subcategory) params.set("subcategory", String(filters.subcategory));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.is_published !== undefined) params.set("is_published", String(filters.is_published));
    return request<PaginatedOrArray<PimProduct>>(`${BASE}/products/?${params}`).then(unwrap);
  },

  getProduct: (id: number): Promise<PimProduct> =>
    request<PimProduct>(`${BASE}/products/${id}/`),

  getProductWithAttributes: (id: number): Promise<PimProduct> =>
    request<PimProduct>(`${BASE}/products/${id}/with_attributes/`),

  createProduct: (data: PimProductCreatePayload): Promise<PimProduct> =>
    request<PimProduct>(`${BASE}/products/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateProduct: (id: number, data: Partial<PimProductCreatePayload>): Promise<PimProduct> =>
    request<PimProduct>(`${BASE}/products/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteProduct: (id: number): Promise<void> =>
    request<void>(`${BASE}/products/${id}/`, { method: "DELETE" }),

  getProductVariants: (id: number): Promise<PimVariant[]> =>
    request<PaginatedOrArray<PimVariant>>(`${BASE}/products/${id}/variants/`).then(unwrap),

  createVariant: (
    productId: number,
    data: {
      sku: string;
      barcode?: string;
      price: string;
      cost_price?: string;
      quantity_on_hand?: number;
      reorder_level?: number;
      attribute_values?: {
        attribute: number;
        value_text?: string;
        value_number?: number | null;
        value_boolean?: boolean | null;
      }[];
    }
  ): Promise<PimVariant> =>
    request<PimVariant>(`${BASE}/products/${productId}/create_variant/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Variants
  updateStock: (variantId: number, qty: number, reorderLevel?: number): Promise<PimVariant> =>
    request<PimVariant>(`${BASE}/variants/${variantId}/update_stock/`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity_on_hand: qty,
        ...(reorderLevel !== undefined ? { reorder_level: reorderLevel } : {}),
      }),
    }),

  updateVariantPricing: (variantId: number, price: string, costPrice?: string): Promise<PimVariant> =>
    request<PimVariant>(`${BASE}/variants/${variantId}/update_pricing/`, {
      method: "PATCH",
      body: JSON.stringify({ price, ...(costPrice ? { cost_price: costPrice } : {}) }),
    }),

  deleteVariant: (variantId: number): Promise<void> =>
    request<void>(`${BASE}/variants/${variantId}/`, { method: "DELETE" }),

  // Cross-module sync
  getRegisterStatus: (params?: {
    search?: string;
    synced?: "true" | "false";
    page?: number;
    page_size?: number;
  }): Promise<RegisterStatusResponse> => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.synced) qs.set("synced", params.synced);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.page_size) qs.set("page_size", String(params.page_size));
    return request<RegisterStatusResponse>(`${BASE}/products/register_status/?${qs}`);
  },

  syncFromRegister: (payload: { product_ids?: number[]; all?: boolean }): Promise<SyncResult> =>
    request<SyncResult>(`${BASE}/products/sync_from_register/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
