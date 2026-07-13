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
