import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  fetchProducts,
  fetchProduct,
  fetchCatalogOptions,
  fetchCategories,
  fetchSubcategories,
  fetchUnits,
} from "./product.api";
import { productKeys, categoryKeys, subcategoryKeys, unitKeys } from "./product.keys";
import type { ProductListParams } from "./product.types";

export function useProducts(params: ProductListParams = {}) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => fetchProducts(params),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => fetchProduct(id),
    enabled: id > 0,
  });
}

export function useCatalogOptions() {
  return useQuery({
    queryKey: productKeys.catalogOptions(),
    queryFn: fetchCatalogOptions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCategories(q?: string) {
  return useQuery({
    queryKey: categoryKeys.list(q),
    queryFn: () => fetchCategories(q ? { q } : undefined),
  });
}

export function useSubcategories(q?: string, category?: number) {
  return useQuery({
    queryKey: subcategoryKeys.list(q, category),
    queryFn: () => fetchSubcategories({ q, category }),
  });
}

export function useUnits(q?: string) {
  return useQuery({
    queryKey: unitKeys.list(q),
    queryFn: () => fetchUnits(q ? { q } : undefined),
  });
}
