import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createBatch, updateBatch } from "./luckyPlan.api";
import { luckyPlanKeys } from "./luckyPlan.keys";
import type {
  LuckyPlanBatchMutationPayload,
  LuckyPlanBatchWritePayload,
} from "./luckyPlan.types";

export function useCreateLuckyPlanBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LuckyPlanBatchWritePayload) => createBatch(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: luckyPlanKeys.batches() }),
  });
}

export function useUpdateLuckyPlanBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<LuckyPlanBatchMutationPayload>) =>
      updateBatch(id, data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: luckyPlanKeys.batches() });
      qc.invalidateQueries({ queryKey: luckyPlanKeys.batchDetail(variables.id) });
      qc.invalidateQueries({ queryKey: luckyPlanKeys.batchSummary(variables.id) });
      qc.invalidateQueries({ queryKey: luckyPlanKeys.batchControlCenter(variables.id) });
    },
  });
}
