import type {
  LuckyPlanBatchListParams,
  LuckyPlanDrawListParams,
  LuckyPlanLuckyIdListParams,
  LuckyPlanListParams,
} from "./luckyPlan.types";

export const luckyPlanKeys = {
  all: ["lucky-plan"] as const,
  batches: () => [...luckyPlanKeys.all, "batches"] as const,
  batchLists: () => [...luckyPlanKeys.batches(), "list"] as const,
  batchList: (params: LuckyPlanBatchListParams) =>
    [...luckyPlanKeys.batchLists(), params] as const,
  batchDetails: () => [...luckyPlanKeys.batches(), "detail"] as const,
  batchDetail: (id: number) => [...luckyPlanKeys.batchDetails(), id] as const,
  batchSummaries: () => [...luckyPlanKeys.batches(), "summary"] as const,
  batchSummary: (id: number) => [...luckyPlanKeys.batchSummaries(), id] as const,
  batchControlCenters: () => [...luckyPlanKeys.batches(), "control-center"] as const,
  batchControlCenter: (id: number) =>
    [...luckyPlanKeys.batchControlCenters(), id] as const,
  luckyIds: () => [...luckyPlanKeys.all, "lucky-ids"] as const,
  luckyIdLists: () => [...luckyPlanKeys.luckyIds(), "list"] as const,
  luckyIdList: (params: LuckyPlanLuckyIdListParams) =>
    [...luckyPlanKeys.luckyIdLists(), params] as const,
  luckyIdDetails: () => [...luckyPlanKeys.luckyIds(), "detail"] as const,
  luckyIdDetail: (id: number) => [...luckyPlanKeys.luckyIdDetails(), id] as const,
  luckyIdAvailability: () => [...luckyPlanKeys.luckyIds(), "available"] as const,
  luckyIdAvailabilityForBatch: (batchId: number) =>
    [...luckyPlanKeys.luckyIdAvailability(), batchId] as const,
  draws: () => [...luckyPlanKeys.all, "draws"] as const,
  drawLists: () => [...luckyPlanKeys.draws(), "list"] as const,
  drawList: (params: LuckyPlanDrawListParams) =>
    [...luckyPlanKeys.drawLists(), params] as const,
  drawDetails: () => [...luckyPlanKeys.draws(), "detail"] as const,
  drawDetail: (id: number) => [...luckyPlanKeys.drawDetails(), id] as const,
  drawTimelines: () => [...luckyPlanKeys.draws(), "timeline"] as const,
  drawTimeline: (id: number) => [...luckyPlanKeys.drawTimelines(), id] as const,
  drawSettlements: () => [...luckyPlanKeys.draws(), "winner-settlement"] as const,
  drawSettlement: (id: number) =>
    [...luckyPlanKeys.drawSettlements(), id] as const,
  list: (params: LuckyPlanListParams) => [...luckyPlanKeys.all, params] as const,
};
