import { api } from "@/shared/api/http-client";
import type { PaginatedResponse } from "@/shared/api/pagination";
import type {
  LuckyPlanBatch,
  LuckyPlanBatchControlCenter,
  LuckyPlanBatchListParams,
  LuckyPlanBatchMutationPayload,
  LuckyPlanBatchSummary,
  LuckyPlanBatchWritePayload,
  LuckyPlanDraw,
  LuckyPlanDrawListParams,
  LuckyPlanDrawTimelineItem,
  LuckyPlanDrawWinnerSettlement,
  LuckyPlanLuckyId,
  LuckyPlanLuckyIdListParams,
} from "./luckyPlan.types";

const BATCHES = "/admin/batches";
const LUCKY_IDS = "/admin/lucky-ids";
const DRAWS = "/admin/lucky-draws";

function listParamsToQuery(params: LuckyPlanBatchListParams) {
  return {
    page: params.page,
    page_size: params.page_size,
    q: params.q || undefined,
    status: params.status || undefined,
  };
}

function luckyIdParamsToQuery(params: LuckyPlanLuckyIdListParams) {
  return {
    page: params.page,
    page_size: params.page_size,
    batch_id: params.batch_id ?? params.batch,
    status: params.status || undefined,
  };
}

function drawParamsToQuery(params: LuckyPlanDrawListParams) {
  return {
    page: params.page,
    page_size: params.page_size,
    batch: params.batch,
    is_revealed:
      params.is_revealed === undefined ? undefined : params.is_revealed,
  };
}

export function fetchBatches(params: LuckyPlanBatchListParams = {}) {
  return api.get<PaginatedResponse<LuckyPlanBatch>>(
    `${BATCHES}/`,
    listParamsToQuery(params),
  );
}

export function fetchBatch(id: number) {
  return api.get<LuckyPlanBatch>(`${BATCHES}/${id}/`);
}

export function fetchBatchSummary(id: number) {
  return api.get<LuckyPlanBatchSummary>(`${BATCHES}/${id}/summary/`);
}

export function fetchBatchControlCenter(id: number) {
  return api.get<LuckyPlanBatchControlCenter>(`${BATCHES}/${id}/control-center/`);
}

export function createBatch(data: LuckyPlanBatchWritePayload) {
  return api.post<LuckyPlanBatch>(`${BATCHES}/`, data);
}

export function updateBatch(id: number, data: Partial<LuckyPlanBatchMutationPayload>) {
  return api.patch<LuckyPlanBatch>(`${BATCHES}/${id}/`, data);
}

export function fetchLuckyIds(params: LuckyPlanLuckyIdListParams = {}) {
  return api.get<PaginatedResponse<LuckyPlanLuckyId>>(
    `${LUCKY_IDS}/`,
    luckyIdParamsToQuery(params),
  );
}

export function fetchLuckyId(id: number) {
  return api.get<LuckyPlanLuckyId>(`${LUCKY_IDS}/${id}/`);
}

export function fetchAvailableLuckyIds(batchId: number) {
  return api.get<{ results: LuckyPlanLuckyId[]; count: number }>(
    `${LUCKY_IDS}/available/`,
    { batch_id: batchId },
  );
}

export function fetchLuckyDraws(params: LuckyPlanDrawListParams = {}) {
  return api.get<PaginatedResponse<LuckyPlanDraw>>(
    `${DRAWS}/`,
    drawParamsToQuery(params),
  );
}

export function fetchLuckyDraw(id: number) {
  return api.get<LuckyPlanDraw>(`${DRAWS}/${id}/`);
}

export function fetchLuckyDrawTimeline(id: number) {
  return api.get<{ results: LuckyPlanDrawTimelineItem[]; count: number }>(
    `${DRAWS}/${id}/timeline/`,
  );
}

export function fetchLuckyDrawWinnerSettlement(id: number) {
  return api.get<LuckyPlanDrawWinnerSettlement>(`${DRAWS}/${id}/winner-settlement/`);
}
