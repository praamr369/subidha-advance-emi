import type { ProductListParams } from "./product.types";

export const productKeys = {
  all: ["products"] as const,
  lists: () => [...productKeys.all, "list"] as const,
  list: (params: ProductListParams) =>
    [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, "detail"] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
  catalogOptions: () => [...productKeys.all, "catalog-options"] as const,
};

export const categoryKeys = {
  all: ["product-categories"] as const,
  list: (q?: string) => [...categoryKeys.all, "list", q ?? ""] as const,
};

export const subcategoryKeys = {
  all: ["product-subcategories"] as const,
  list: (q?: string, category?: number) =>
    [...subcategoryKeys.all, "list", q ?? "", category ?? ""] as const,
};

export const unitKeys = {
  all: ["product-units"] as const,
  list: (q?: string) => [...unitKeys.all, "list", q ?? ""] as const,
};
