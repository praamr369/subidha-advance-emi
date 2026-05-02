import { request } from "@/services/api";
import type {
  CancelPayoutBatchPayload,
  CancelPayoutBatchResponse,
  CreatePayoutBatchPayload,
  CreatePayoutBatchResponse,
  FinalizePayoutBatchResponse,
  PayoutBatchDetail,
  PayoutBatchListResponse,
  PayoutBatchPreviewResponse,
  PayoutBatchStatus,
} from "@/types/payout-batch";

export type PayoutBatchListQuery = {
  status?: PayoutBatchStatus | "";
  date_from?: string;
  date_to?: string;
};

export type PayoutBatchPreviewQuery = {
  partner?: number | string;
  date_from?: string;
  date_to?: string;
};

function buildQuery(
  params: Record<string, string | number | undefined | null> = {}
): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function getPayoutBatchPreview(
  params: PayoutBatchPreviewQuery = {}
): Promise<PayoutBatchPreviewResponse> {
  return request<PayoutBatchPreviewResponse>(
    `/admin/commission-payout-batches/preview/${buildQuery({
      date_from: params.date_from,
      date_to: params.date_to,
      partner: params.partner,
    })}`
  );
}

export async function createPayoutBatch(
  payload: CreatePayoutBatchPayload
): Promise<CreatePayoutBatchResponse> {
  return request<CreatePayoutBatchResponse>("/admin/commission-payout-batches/", {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

export async function getPayoutBatchList(
  params: PayoutBatchListQuery = {}
): Promise<PayoutBatchListResponse> {
  return request<PayoutBatchListResponse>(
    `/admin/commission-payout-batches/list/${buildQuery(params)}`
  );
}

export async function getPayoutBatchDetail(
  id: number | string
): Promise<PayoutBatchDetail> {
  return request<PayoutBatchDetail>(`/admin/commission-payout-batches/${id}/`);
}

/** Path segment only; compose with API_BASE_URL / apiFetch (which already includes `/api/v1`). */
export function getPayoutBatchExportUrl(id: number | string): string {
  return `/admin/commission-payout-batches/${id}/export/`;
}

export async function finalizePayoutBatch(
  id: number | string
): Promise<FinalizePayoutBatchResponse> {
  return request<FinalizePayoutBatchResponse>(
    `/admin/commission-payout-batches/${id}/finalize/`,
    {
      method: "POST",
      body: JSON.stringify({}),
      retryCount: 0,
    }
  );
}

export async function cancelPayoutBatch(
  id: number | string,
  payload: CancelPayoutBatchPayload
): Promise<CancelPayoutBatchResponse> {
  return request<CancelPayoutBatchResponse>(
    `/admin/commission-payout-batches/${id}/cancel/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
      retryCount: 0,
    }
  );
}
