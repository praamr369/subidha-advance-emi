import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createCustomer,
  updateCustomer,
  submitKycDecision,
} from "./customer.api";
import { customerKeys } from "./customer.keys";
import type {
  CustomerCreatePayload,
  CustomerUpdatePayload,
  KycDecisionPayload,
} from "./customer.types";

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerCreatePayload) => createCustomer(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.lists() }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & CustomerUpdatePayload) =>
      updateCustomer(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all }),
  });
}

export function useKycDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & KycDecisionPayload) =>
      submitKycDecision(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: customerKeys.all }),
  });
}
