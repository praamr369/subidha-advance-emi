import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  updateProduct,
  createCategory,
  updateCategory,
  createSubcategory,
  updateSubcategory,
  createUnit,
  updateUnit,
} from "./product.api";
import { productKeys, categoryKeys, subcategoryKeys, unitKeys } from "./product.keys";
import type {
  ProductCreatePayload,
  ProductUpdatePayload,
} from "./product.types";

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProductCreatePayload) => createProduct(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.lists() }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & ProductUpdatePayload) =>
      updateProduct(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      is_active?: boolean;
    }) => updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoryKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}

export function useCreateSubcategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { category: number; name: string; description?: string }) =>
      createSubcategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcategoryKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}

export function useUpdateSubcategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      name?: string;
      description?: string;
      is_active?: boolean;
      category?: number;
    }) => updateSubcategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: subcategoryKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; name: string; description?: string }) =>
      createUnit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: number;
      code?: string;
      name?: string;
      description?: string;
      is_active?: boolean;
    }) => updateUnit(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: unitKeys.all });
      qc.invalidateQueries({ queryKey: productKeys.catalogOptions() });
    },
  });
}
