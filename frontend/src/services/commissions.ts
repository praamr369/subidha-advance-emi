import { request } from "@/services/api";
import type {
  AdminCommissionListResponse,
  AdminCommissionReconciliationResponse,
  AdminCommissionSummaryResponse,
  BulkSettleAdminCommissionsPayload,
  BulkSettleAdminCommissionsResponse,
  CommissionStatus,
} from "@/types/commission";

export type AdminCommissionListQuery = {
  partner?: number | string;
  status?: CommissionStatus | "";
  subscription?: number | string;
  payment?: number | string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
};

export type AdminCommissionSummaryQuery = {
  partner?: number | string;
  status?: CommissionStatus | "";
  subscription?: number | string;
  payment?: number | string;
  date_from?: string;
  date_to?: string;
};

export type AdminCommissionReconciliationQuery = {
  partner?: number | string;
};

export type AdminCommissionStatementExportQuery = {
  partner?: number | string;
  status?: CommissionStatus | "";
  date_from?: string;
  date_to?: string;
  export_format: "csv" | "pdf";
};

function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function getAdminCommissionList(
  params: AdminCommissionListQuery = {}
): Promise<AdminCommissionListResponse> {
  const query = buildQuery({
    partner: params.partner,
    status: params.status,
    subscription: params.subscription,
    payment: params.payment,
    date_from: params.date_from,
    date_to: params.date_to,
    limit: params.limit,
    offset: params.offset,
  });

  return request<AdminCommissionListResponse>(`/admin/commissions/${query}`);
}

export async function getAdminCommissionSummary(
  params: AdminCommissionSummaryQuery = {}
): Promise<AdminCommissionSummaryResponse> {
  const query = buildQuery({
    partner: params.partner,
    status: params.status,
    subscription: params.subscription,
    payment: params.payment,
    date_from: params.date_from,
    date_to: params.date_to,
  });

  return request<AdminCommissionSummaryResponse>(
    `/admin/commissions/summary/${query}`
  );
}

export async function getAdminCommissionReconciliation(
  params: AdminCommissionReconciliationQuery = {}
): Promise<AdminCommissionReconciliationResponse> {
  const query = buildQuery({
    partner: params.partner,
  });

  return request<AdminCommissionReconciliationResponse>(
    `/admin/commissions/reconciliation/${query}`
  );
}

export function getAdminCommissionStatementExportPath(
  params: AdminCommissionStatementExportQuery
): string {
  const query = buildQuery({
    partner: params.partner,
    status: params.status,
    date_from: params.date_from,
    date_to: params.date_to,
    export_format: params.export_format,
  });

  return `/admin/commissions/statements/export/${query}`;
}

export async function bulkSettleAdminCommissions(
  payload: BulkSettleAdminCommissionsPayload
): Promise<BulkSettleAdminCommissionsResponse> {
  return request<BulkSettleAdminCommissionsResponse>(
    "/admin/commissions/bulk-settle/",
    {
      method: "POST",
      body: JSON.stringify(payload),
      retryCount: 0,
    }
  );
}
