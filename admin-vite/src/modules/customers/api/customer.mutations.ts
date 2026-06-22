import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createCustomer, updateCustomer, deleteCustomer } from "./customer.api";
import { customerKeys } from "./customer.keys";

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Record<string, unknown>) =>
      updateCustomer(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}
