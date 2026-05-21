import { request } from "@/services/api";
import type {
  PaginatedResponse,
  ReconciliationItem,
  ReconciliationItemDetail,
  ReconciliationModuleSummary,
  ReconciliationRun,
} from "@/types/reconciliation";

export type ReconciliationRunCreatePayload = {
  scope?: string;
  module?: string;
  branch_id?: number | null;
  date_from?: string | null;
  date_to?: string | null;
};

export type ReconciliationItemListQuery = {
  run?: number | string;
  module?: string;
  status?: string;
  severity?: string;
  exception_code?: string;
  search?: string;
  page?: number;
};

function toQueryString(query?: Record<string, string | number | null | undefined>): string {
  if (!query) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function listReconciliationRuns(): Promise<PaginatedResponse<ReconciliationRun>> {
  return request<PaginatedResponse<ReconciliationRun>>("/admin/reconciliation/runs/");
}

export async function createReconciliationRun(payload: ReconciliationRunCreatePayload): Promise<ReconciliationRun> {
  return request<ReconciliationRun>("/admin/reconciliation/runs/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getReconciliationRun(id: number | string): Promise<ReconciliationRun> {
  return request<ReconciliationRun>(`/admin/reconciliation/runs/${id}/`);
}

export async function getReconciliationModules(run?: number | string): Promise<{ run: ReconciliationRun | null; results: ReconciliationModuleSummary[] }> {
  const qs = run ? toQueryString({ run }) : "";
  return request<{ run: ReconciliationRun | null; results: ReconciliationModuleSummary[] }>(`/admin/reconciliation/modules/${qs}`);
}

export async function listReconciliationItems(query: ReconciliationItemListQuery = {}): Promise<PaginatedResponse<ReconciliationItem>> {
  const qs = toQueryString(query as Record<string, string | number | null | undefined>);
  return request<PaginatedResponse<ReconciliationItem>>(`/admin/reconciliation/items/${qs}`);
}

export async function getReconciliationItem(id: number | string): Promise<ReconciliationItemDetail> {
  return request<ReconciliationItemDetail>(`/admin/reconciliation/items/${id}/`);
}

export async function resolveReconciliationItem(id: number | string, payload: { action: string; note: string }): Promise<ReconciliationItemDetail> {
  return request<ReconciliationItemDetail>(`/admin/reconciliation/items/${id}/resolve/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function reopenReconciliationItem(id: number | string, payload: { note: string }): Promise<ReconciliationItemDetail> {
  return request<ReconciliationItemDetail>(`/admin/reconciliation/items/${id}/reopen/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
