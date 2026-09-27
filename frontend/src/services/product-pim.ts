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
  is_variant_defining: boolean;
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

export type PimProductAccessory = {
  id: number;
  product: number;
  related_product: number;
  related_pim_product_id: number;
  related_pim_product_name: string;
  related_pim_product_code: string;
};

export function listPimProductAccessories(productId: number | string) {
  return apiFetch<PimProductAccessory[]>(`${BASE}/${productId}/accessories/`);
}

export function addPimProductAccessory(productId: number | string, relatedPimId: number) {
  return apiFetch<PimProductAccessory>(`${BASE}/${productId}/accessories/`, {
    method: "POST",
    body: JSON.stringify({ related_pim_id: relatedPimId }),
  });
}

export function removePimProductAccessory(productId: number | string, accessoryId: number) {
  return apiFetch(`${BASE}/${productId}/accessories/${accessoryId}/`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// Variant publish control
// ---------------------------------------------------------------------------

export type PimVariantPublishRow = {
  id: number;
  code: string;
  name: string;
  sku: string;
  is_published: boolean;
  is_active: boolean;
  price: string | null;
};

export type PimVariantPublishControl = {
  base: { id: number; code: string; name: string; is_published: boolean };
  variants: PimVariantPublishRow[];
};

export function getVariantPublishControl(productId: number | string) {
  return apiFetch<PimVariantPublishControl>(`${BASE}/${productId}/variants/publish-control/`);
}

export function patchVariantPublishControl(
  productId: number | string,
  body:
    | { all: boolean }
    | { base_published?: boolean; variants?: Array<{ id: number; is_published: boolean }> }
) {
  return apiFetch<PimVariantPublishControl>(`${BASE}/${productId}/variants/publish-control/`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
