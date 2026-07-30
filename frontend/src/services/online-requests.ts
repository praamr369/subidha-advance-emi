import { apiFetch } from "@/lib/api";

type ApiObject = Record<string, unknown>;
type ApiListResponse = { results?: ApiObject[]; count?: number; next?: string | null; previous?: string | null; [key: string]: unknown };

export async function listAdminOnlineRequests(params?: {
  status?: string;
  request_type?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<ApiListResponse> {
  const qs = new URLSearchParams();
  if (params?.status?.trim()) qs.set("status", params.status.trim());
  if (params?.request_type?.trim()) qs.set("request_type", params.request_type.trim());
  if (params?.q?.trim()) qs.set("q", params.q.trim());
  if (params?.page != null && params.page > 1) qs.set("page", String(params.page));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch(q ? `/admin/requests/online/?${q}` : "/admin/requests/online/");
}

export async function getAdminOnlineRequest(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/`);
}

export async function adminGenerateQuote(
  id: number,
  payload: { discount_amount?: number; delivery_cost?: number },
): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/generate-quote/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminSendQuote(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/send-quote/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function adminApproveRequest(
  id: number,
  payload: { approval_notes?: string; create_transaction?: boolean },
): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/approve/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminRejectRequest(
  id: number,
  payload: { reason?: string },
): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/reject/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminCompleteRequest(
  id: number,
  payload: { notes?: string },
): Promise<ApiObject> {
  return apiFetch(`/admin/requests/online/${id}/complete/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
