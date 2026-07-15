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
  description?: string;
  purposes: { key: CatalogPurposeKey; label: string }[];
  flags?: Record<string, unknown>;
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
  return { total: 0, purposes: [], brands: [], categories: [], price_min: 0, price_max: 0 };
}

export async function listCatalogProducts(role: CatalogRole, params: Record<string, unknown>): Promise<{ count: number; next: string | null; previous: string | null; results: CatalogProduct[] }> {
  return { count: 0, next: null, previous: null, results: [] };
}
