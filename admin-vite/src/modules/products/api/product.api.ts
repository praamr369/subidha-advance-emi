import { api } from "@/shared/api/http-client";
import type { PaginatedResponse } from "@/shared/api/pagination";
import type {
  ProductAdmin,
  ProductCreatePayload,
  ProductUpdatePayload,
  ProductListParams,
  CatalogOptions,
  CategoryMaster,
  SubcategoryMaster,
  UnitOfMeasureMaster,
} from "./product.types";

const BASE = "/admin/products";
const CATEGORIES = "/admin/product-categories";
const SUBCATEGORIES = "/admin/product-subcategories";
const UNITS = "/admin/product-units";

function listParamsToQuery(
  params: ProductListParams,
): Record<string, string | number | undefined> {
  return {
    page: params.page,
    page_size: params.page_size,
    q: params.q || undefined,
    category: params.category || undefined,
    subcategory: params.subcategory || undefined,
    unit_of_measure: params.unit_of_measure || undefined,
  };
}

export function fetchProducts(params: ProductListParams) {
  return api.get<PaginatedResponse<ProductAdmin>>(
    `${BASE}/`,
    listParamsToQuery(params),
  );
}

export function fetchProduct(id: number) {
  return api.get<ProductAdmin>(`${BASE}/${id}/`);
}

export function createProduct(data: ProductCreatePayload) {
  return api.post<ProductAdmin>(`${BASE}/`, data);
}

export function updateProduct(id: number, data: ProductUpdatePayload) {
  return api.patch<ProductAdmin>(`${BASE}/${id}/`, data);
}

export function fetchCatalogOptions() {
  return api.get<CatalogOptions>(`${BASE}/catalog-options/`);
}

export function fetchCategories(params?: { q?: string }) {
  return api.get<PaginatedResponse<CategoryMaster>>(
    `${CATEGORIES}/`,
    params?.q ? { q: params.q } : undefined,
  );
}

export function createCategory(data: { name: string; description?: string }) {
  return api.post<CategoryMaster>(`${CATEGORIES}/`, data);
}

export function updateCategory(
  id: number,
  data: Partial<{ name: string; description: string; is_active: boolean }>,
) {
  return api.patch<CategoryMaster>(`${CATEGORIES}/${id}/`, data);
}

export function fetchSubcategories(params?: { q?: string; category?: number }) {
  const query: Record<string, string | number | undefined> = {};
  if (params?.q) query.q = params.q;
  if (params?.category) query.category = params.category;
  return api.get<PaginatedResponse<SubcategoryMaster>>(
    `${SUBCATEGORIES}/`,
    Object.keys(query).length > 0 ? query : undefined,
  );
}

export function createSubcategory(data: {
  category: number;
  name: string;
  description?: string;
}) {
  return api.post<SubcategoryMaster>(`${SUBCATEGORIES}/`, data);
}

export function updateSubcategory(
  id: number,
  data: Partial<{ name: string; description: string; is_active: boolean; category: number }>,
) {
  return api.patch<SubcategoryMaster>(`${SUBCATEGORIES}/${id}/`, data);
}

export function fetchUnits(params?: { q?: string }) {
  return api.get<PaginatedResponse<UnitOfMeasureMaster>>(
    `${UNITS}/`,
    params?.q ? { q: params.q } : undefined,
  );
}

export function createUnit(data: { code: string; name: string; description?: string }) {
  return api.post<UnitOfMeasureMaster>(`${UNITS}/`, data);
}

export function updateUnit(
  id: number,
  data: Partial<{ code: string; name: string; description: string; is_active: boolean }>,
) {
  return api.patch<UnitOfMeasureMaster>(`${UNITS}/${id}/`, data);
}
