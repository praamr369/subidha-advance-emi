import { apiFetch } from "@/lib/api";

// Product-keyed PIM editing — edit a product's PIM attributes by the operational
// product id. Because product and PIM share one linked record, saves here reflect
// in the PIM module immediately.

export type PimAttributeRow = {
  attribute_id: number;
  name: string;
  slug: string;
  data_type: "TEXT" | "NUMBER" | "DECIMAL" | "CHOICE" | "MULTI_CHOICE" | "BOOLEAN" | string;
  is_required: boolean;
  options: Array<{ id: number; value: string; display_name?: string }>;
  value_text: string;
  value_number: string | null;
  value_boolean: boolean | null;
  value_date: string | null;
};

export type ProductPimDetail = {
  product_id: number;
  pim_product_id: number;
  code: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  subcategory_id: number | null;
  is_published: boolean;
  attributes: PimAttributeRow[];
};

export type PimCategoryOption = {
  id: number;
  name: string;
  slug: string;
};

const BASE = "/pim/by-product";

export function getProductPim(productId: number | string) {
  return apiFetch<ProductPimDetail>(`${BASE}/${productId}/`);
}

export function setProductPimCategory(
  productId: number | string,
  body: { category_id?: number; subcategory_id?: number | null; is_published?: boolean }
) {
  return apiFetch<ProductPimDetail>(`${BASE}/${productId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export type PimAttributeValueInput = {
  attribute_id: number;
  value_text?: string;
  value_number?: string | number | null;
  value_boolean?: boolean | null;
  value_date?: string | null;
};

export function saveProductPimAttributes(
  productId: number | string,
  attributes: PimAttributeValueInput[]
) {
  return apiFetch<{ saved: number; attributes: PimAttributeRow[] }>(
    `${BASE}/${productId}/attributes/`,
    {
      method: "PUT",
      body: JSON.stringify({ attributes }),
    }
  );
}

// PIM categories for the category picker.
export function listPimCategoryOptions() {
  return apiFetch<PimCategoryOption[] | { results: PimCategoryOption[] }>(
    "/pim/categories/"
  ).then((payload) => (Array.isArray(payload) ? payload : payload.results ?? []));
}
