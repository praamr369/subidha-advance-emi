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
  /** Extra cost in INR added when this option is selected (0 for standard options). */
  extra_cost: string | number;
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
  image?: string | null;
}

export interface PimProduct {
  id: number;
  code: string;
  brand?: string;
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
  locked_attributes?: number[];
  variant_count?: number;
  /** Set when this PIM product is a variant SKU under a base product */
  parent_id?: number | null;
  parent_code?: string | null;
  parent_name?: string | null;
  parent_is_published?: boolean | null;
  /** Number of child variant-SKU PIM products under this base product */
  child_count?: number;
  attributes?: PimProductAttribute[];
  variants?: PimVariant[];
  /** Base product's ProductAttribute values (only set when this is a variant PimProduct) */
  inherited_attribute_values?: PimProductAttribute[];
  /** VariantAttributeValues from ProductVariant matching this PimProduct's SKU code */
  variant_attribute_values?: PimVariantAttributeValue[];
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
  locked_attributes?: number[];
  remove_attributes?: number[];
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

  getAllAttributes: (): Promise<PimCategoryAttribute[]> => {
    return request<PaginatedOrArray<PimCategoryAttribute>>(`${BASE}/attributes/?page_size=1000`).then(unwrap);
  },

  createAttribute: (data: {
    category: number;
    subcategory?: number | null;
    name: string;
    data_type: PimCategoryAttribute["data_type"];
    is_required?: boolean;
    is_variant_defining?: boolean;
    display_order?: number;
  }): Promise<PimCategoryAttribute> =>
    request<PimCategoryAttribute>(`${BASE}/attributes/`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  createAttributeOption: (attributeId: number, data: { value: string; display_name?: string; extra_cost?: number; display_order?: number }): Promise<PimAttributeOption> =>
    request<PimAttributeOption>(`${BASE}/attribute-options/`, {
      method: "POST",
      body: JSON.stringify({ attribute: attributeId, ...data }),
    }),

  // Products
  getProducts: (filters?: {
    category?: string | number;
    subcategory?: number;
    search?: string;
    is_published?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<{ results: PimProduct[]; count: number }> => {
    const params = new URLSearchParams();
    params.set("page_size", filters?.page_size ? String(filters.page_size) : "50");
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.category) params.set("category", String(filters.category));
    if (filters?.subcategory) params.set("subcategory", String(filters.subcategory));
    if (filters?.search) params.set("search", filters.search);
    if (filters?.is_published !== undefined) params.set("is_published", String(filters.is_published));
    return request<PaginatedOrArray<PimProduct>>(`${BASE}/products/?${params}`).then((raw) => {
      if (Array.isArray(raw)) return { results: raw, count: raw.length };
      return { results: raw.results ?? [], count: raw.count ?? (raw.results?.length ?? 0) };
    });
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

  updateVariantImage: (variantId: number, imageFile: File): Promise<PimVariant> => {
    const formData = new FormData();
    formData.append("image", imageFile);
    return request<PimVariant>(`${BASE}/variants/${variantId}/`, {
      method: "PATCH",
      body: formData,
    });
  },

  patchVariant: (
    variantId: number,
    data: Partial<Pick<PimVariant, "is_active" | "barcode">>
  ): Promise<PimVariant> =>
    request<PimVariant>(`${BASE}/variants/${variantId}/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  updateVariantAttributes: (
    variantId: number,
    data: {
      attribute_values?: { attribute: number; value_text?: string; value_number?: number | null; value_boolean?: boolean | null }[];
      price?: string;
      cost_price?: string;
      barcode?: string;
      reorder_level?: number;
    }
  ): Promise<PimVariant> =>
    request<PimVariant>(`${BASE}/variants/${variantId}/update_attributes/`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteVariant: (variantId: number): Promise<void> =>
    request<void>(`${BASE}/variants/${variantId}/`, { method: "DELETE" }),

  // Workbench (variant generation / bulk ops — uses product CODE as lookup)
  getWorkbenchAttributes: (code: string): Promise<{
    category: string;
    subcategory: string | null;
    attributes: {
      id: number;
      name: string;
      slug: string;
      data_type: string;
      is_variant_defining: boolean;
      is_selected_for_variants?: boolean;
      option_count: number;
      options: { id: number; value: string; display_name: string; extra_cost?: string | number }[];
    }[];
  }> => request(`${BASE}/workbench/${encodeURIComponent(code)}/attributes/`),

  previewVariants: (
    code: string,
    pricingRules: Record<string, number>,
    attributeIds?: number[]
  ): Promise<{
    total_combinations: number;
    price_range: { min: number; max: number };
    sample_skus: { sku: string; price: number; attributes: Record<string, string> }[];
    total_samples: number;
  }> =>
    request(`${BASE}/workbench/${encodeURIComponent(code)}/preview_variants/`, {
      method: "POST",
      body: JSON.stringify({ pricing_rules: pricingRules, attribute_ids: attributeIds }),
    }),

  generateVariants: (
    code: string,
    pricingRules: Record<string, number>,
    clearExisting: boolean,
    attributeIds?: number[]
  ): Promise<{ created: number; skipped: number; total: number; errors: string[] }> =>
    request(`${BASE}/workbench/${encodeURIComponent(code)}/generate_variants/`, {
      method: "POST",
      body: JSON.stringify({ pricing_rules: pricingRules, clear_existing: clearExisting, attribute_ids: attributeIds }),
    }),

  getVariantSummary: (code: string): Promise<{
    total_variants: number;
    active_variants: number;
    price_range: { min: number; max: number };
    total_inventory: number;
    low_stock_count: number;
  }> => request(`${BASE}/workbench/${encodeURIComponent(code)}/variant_summary/`),

  bulkUpdateVariants: (
    code: string,
    updates: Record<string, Record<string, unknown>>
  ): Promise<{ updated: number; skipped: number; errors: string[] }> =>
    request(`${BASE}/workbench/${encodeURIComponent(code)}/bulk_update_variants/`, {
      method: "POST",
      body: JSON.stringify({ updates }),
    }),

  clearVariants: (code: string): Promise<{ deleted: number; message: string }> =>
    request(`${BASE}/workbench/${encodeURIComponent(code)}/clear_variants/`, {
      method: "DELETE",
    }),

  relinkParents: (): Promise<{ linked: number; message: string }> =>
    request(`${BASE}/products/relink_parents/`, { method: "POST" }),

  repairVariantCategories: (): Promise<{ repaired: string[]; count: number; message: string }> =>
    request(`${BASE}/products/repair_variant_categories/`, { method: "POST" }),

  adoptOrphanVariants: (productId: number): Promise<{ adopted: string[]; skipped: string[]; errors: {code: string; error: string}[]; message: string }> =>
    request(`${BASE}/products/${productId}/adopt_orphan_variants/`, { method: "POST" }),

  cleanStaleLocks: (productId: number): Promise<{ before: number[]; after: number[]; removed: number[]; message: string }> =>
    request(`${BASE}/products/${productId}/clean_stale_locks/`, { method: "POST" }),

  pushToVariants: (
    productId: number,
    options: { push_description?: boolean; push_name?: boolean }
  ): Promise<{ updated: number; total_variants: number }> =>
    request(`${BASE}/products/${productId}/push_to_variants/`, {
      method: "POST",
      body: JSON.stringify(options),
    }),

  autoBom: (productId: number): Promise<{
    created: boolean;
    bom_no: string;
    bom_id: number;
    lines: number;
    warnings: string[];
    variant_attrs: Record<string, string>;
  }> =>
    request(`${BASE}/products/${productId}/auto_bom/`, { method: "POST" }),

  getBomStatus: (productId: number): Promise<{
    product_code: string;
    inventory_item_id: number;
    boms: {
      id: number;
      bom_no: string;
      status: string;
      revision_no: number;
      is_default: boolean;
      lines: { product_code: string; name: string; qty: string; unit: string; wastage_pct: string; notes: string }[];
    }[];
    services: {
      service_code: string;
      service_name: string;
      service_type: string;
      charge_mode: string;
      price: string;
      is_default: boolean;
    }[];
    warning?: string;
  }> =>
    request(`${BASE}/products/${productId}/bom_status/`),

  publishBlueprint: (productId: number): Promise<{
    published: boolean;
    child_pim_published: number;
    variants_activated: number;
    total_variants: number;
  }> =>
    request(`${BASE}/products/${productId}/publish/`, { method: "POST" }),

  unpublishBlueprint: (productId: number): Promise<{
    published: boolean;
    child_pim_unpublished: number;
  }> =>
    request(`${BASE}/products/${productId}/unpublish/`, { method: "POST" }),

  // Cross-module sync
  getRegisterStatus: (params?: {
    search?: string;
    category?: string | number;
    synced?: "true" | "false";
    page?: number;
    page_size?: number;
  }): Promise<RegisterStatusResponse> => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category) qs.set("category", String(params.category));
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
