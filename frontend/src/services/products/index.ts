import { request } from "@/services/api";
import { toResultsArray } from "@/services/api/list";
import { resolveApiMediaUrl } from "@/lib/media";

export type ProductRecord = {
  id: number;
  name: string;
  product_code?: string;
  base_price?: string;

  // P2 product master fields
  category?: string;
  subcategory?: string;
  description?: string;
  image?: string | null;
  is_active?: boolean;

  // capability flags
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;

  // legacy flags retained for compatibility if backend still returns them
  is_rent_ready?: boolean;
  is_lease_ready?: boolean;

  created_at?: string;
};

export type ProductListParams = {
  q?: string;
  category?: string;
  is_active?: boolean;
};

export type CreateOrUpdateProductPayload =
  | Record<string, unknown>
  | FormData;

function normalizeProductRecord(product: ProductRecord): ProductRecord {
  return {
    ...product,
    image: resolveApiMediaUrl(product.image),
  };
}

function buildQuery(params?: ProductListParams): string {
  if (!params) return "";

  const search = new URLSearchParams();

  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (typeof params.is_active === "boolean") {
    search.set("is_active", String(params.is_active));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listProducts(
  params?: ProductListParams
): Promise<ProductRecord[]> {
  const payload = await request(`/admin/products/${buildQuery(params)}`);
  return toResultsArray<ProductRecord>(payload).map((product) =>
    normalizeProductRecord(product)
  );
}

export async function getProduct(
  id: number | string
): Promise<ProductRecord> {
  const payload = await request<ProductRecord>(`/admin/products/${id}/`);
  return normalizeProductRecord(payload);
}

export async function createProduct(
  payload: CreateOrUpdateProductPayload
): Promise<ProductRecord> {
  const result = await request<ProductRecord>("/admin/products/", {
    method: "POST",
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
    retryCount: 0,
  });
  return normalizeProductRecord(result);
}

export async function updateProduct(
  id: number | string,
  payload: CreateOrUpdateProductPayload
): Promise<ProductRecord> {
  const result = await request<ProductRecord>(`/admin/products/${id}/`, {
    method: "PATCH",
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
    retryCount: 0,
  });
  return normalizeProductRecord(result);
}
