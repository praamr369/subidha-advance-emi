import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";

export type CatalogInputType = "SELECT" | "MULTI_SELECT" | "NUMBER" | "TEXT" | "BOOLEAN";

export type CatalogCategory = {
  id: number;
  name: string;
  slug: string;
  path: string;
  parent: number | null;
  is_active: boolean;
};

export type AttributeDefinition = {
  id: number;
  category: number;
  name: string;
  code: string;
  input_type: CatalogInputType;
  options: string[];
  unit: string;
  is_variant_attribute: boolean;
  is_spec_attribute: boolean;
  is_required: boolean;
  sort_order: number;
  min_value: string | null;
  max_value: string | null;
  is_active: boolean;
};

export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  const payload = await request("/admin/catalog/categories/");
  return toResultsArray<CatalogCategory>(payload).filter((category) => category.is_active);
}

export async function listCatalogAttributeDefinitions(category: number): Promise<AttributeDefinition[]> {
  const payload = await request(`/admin/catalog/attribute-definitions/?category=${category}`);
  return toResultsArray<AttributeDefinition>(payload)
    .filter((definition) => definition.is_active && definition.is_spec_attribute)
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
}

export type CatalogPurposeKey = "emi" | "rent" | "lease" | "direct_sale" | "purchase_request";
export type CatalogRole = "customer" | "partner" | "vendor" | "staff" | "public";

export type CatalogProduct = {
  id: number;
  name: string;
  slug: string;
  brand_name: string | null;
  base_price: string;
  media_url?: string;
  image?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  product_code?: string;
  base_specs?: Record<string, string>;
  warranty_enabled?: boolean;
  warranty_months_manufacturing?: number;
  warranty_months_structural?: number;
  warranty_months_extended_max?: number;
  extended_warranty_cost_percentage?: string;
  purposes: { key: CatalogPurposeKey; label: string }[];
  flags?: Record<string, boolean>;
  [key: string]: unknown;
};

export type CatalogFacets = {
  total: number;
  purposes: { key: CatalogPurposeKey; label: string; count: number }[];
  brands: { name: string; count: number }[];
  categories: { name: string; count: number }[];
  price_min: number;
  price_max: number;
};

export async function getCatalogFacets(role: CatalogRole): Promise<CatalogFacets> {
  const payload = await request(`/${role}/catalog/facets/`);
  const data = (payload || {}) as any;
  return {
    total: data.total || 0,
    purposes: data.purposes || [],
    brands: [],
    categories: data.categories || [],
    price_min: 0,
    price_max: 0,
  };
}

export async function listCatalogProducts(
  role: CatalogRole, 
  params: Record<string, unknown>
): Promise<{ count: number; next: string | null; previous: string | null; results: CatalogProduct[] }> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }
  const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const payload = await request(`/${role}/catalog/${query}`);
  const data = (payload || {}) as any;
  return {
    count: data.count || 0,
    next: data.next || null,
    previous: data.previous || null,
    results: data.results || [],
  };
}

export async function getCatalogProduct(
  role: CatalogRole,
  id: number | string
): Promise<CatalogProduct> {
  const payload = await request(`/${role}/catalog/${id}/`);
  return payload as CatalogProduct;
}
