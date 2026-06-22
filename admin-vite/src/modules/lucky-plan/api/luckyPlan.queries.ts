import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { luckyPlanKeys } from "./luckyPlan.keys";
import {
  fetchAvailableLuckyIds,
  fetchBatch,
  fetchBatchControlCenter,
  fetchBatchSummary,
  fetchBatches,
  fetchLuckyDraw,
  fetchLuckyDrawTimeline,
  fetchLuckyDrawWinnerSettlement,
  fetchLuckyDraws,
  fetchLuckyId,
  fetchLuckyIds,
} from "./luckyPlan.api";
import type {
  LuckyPlanBatchListParams,
  LuckyPlanDrawListParams,
  LuckyPlanLuckyIdListParams,
} from "./luckyPlan.types";

export function useLuckyPlanBatches(params: LuckyPlanBatchListParams = {}) {
  return useQuery({
    queryKey: luckyPlanKeys.batchList(params),
    queryFn: () => fetchBatches(params),
    placeholderData: keepPreviousData,
  });
}

export function useLuckyPlanBatch(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.batchDetail(id),
    queryFn: () => fetchBatch(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanBatchSummary(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.batchSummary(id),
    queryFn: () => fetchBatchSummary(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanBatchControlCenter(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.batchControlCenter(id),
    queryFn: () => fetchBatchControlCenter(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanLuckyIds(params: LuckyPlanLuckyIdListParams = {}) {
  return useQuery({
    queryKey: luckyPlanKeys.luckyIdList(params),
    queryFn: () => fetchLuckyIds(params),
    placeholderData: keepPreviousData,
    enabled: Boolean(params.batch_id ?? params.batch),
  });
}

export function useLuckyPlanLuckyId(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.luckyIdDetail(id),
    queryFn: () => fetchLuckyId(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanAvailableLuckyIds(batchId: number) {
  return useQuery({
    queryKey: luckyPlanKeys.luckyIdAvailabilityForBatch(batchId),
    queryFn: () => fetchAvailableLuckyIds(batchId),
    enabled: batchId > 0,
  });
}

export function useLuckyPlanDraws(params: LuckyPlanDrawListParams = {}) {
  return useQuery({
    queryKey: luckyPlanKeys.drawList(params),
    queryFn: () => fetchLuckyDraws(params),
    placeholderData: keepPreviousData,
    enabled: Boolean(params.batch),
  });
}

export function useLuckyPlanDraw(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.drawDetail(id),
    queryFn: () => fetchLuckyDraw(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanDrawTimeline(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.drawTimeline(id),
    queryFn: () => fetchLuckyDrawTimeline(id),
    enabled: id > 0,
  });
}

export function useLuckyPlanDrawWinnerSettlement(id: number) {
  return useQuery({
    queryKey: luckyPlanKeys.drawSettlement(id),
    queryFn: () => fetchLuckyDrawWinnerSettlement(id),
    enabled: id > 0,
  });
}
