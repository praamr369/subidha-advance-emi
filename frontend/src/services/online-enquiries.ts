import { apiFetch } from "@/lib/api";

type ApiObject = Record<string, unknown>;
type ApiListResponse = { results?: ApiObject[]; [key: string]: unknown };

export async function listOnlineEnquiries(params?: { status?: string; limit?: number }): Promise<ApiListResponse> {
  const qs = new URLSearchParams();
  if (params?.status?.trim()) qs.set("status", params.status.trim());
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const q = qs.toString();
  return apiFetch(q ? `/admin/online-enquiries/?${q}` : "/admin/online-enquiries/");
}

export async function getOnlineEnquiry(id: number): Promise<ApiObject> {
  return apiFetch(`/admin/online-enquiries/${id}/`);
}

export async function suggestVendorsForOnlineEnquiry(id: number): Promise<ApiListResponse> {
  return apiFetch(`/admin/online-enquiries/${id}/suggest-vendors/`, { method: "POST", body: JSON.stringify({}) });
}

export async function requestQuotesForOnlineEnquiry(id: number, payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch(`/admin/online-enquiries/${id}/request-vendor-quotes/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function selectVendorQuoteForOnlineEnquiry(id: number, payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch(`/admin/online-enquiries/${id}/select-vendor-quote/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createDraftPurchaseOrderForOnlineEnquiry(id: number, payload: Record<string, unknown>): Promise<ApiObject> {
  return apiFetch(`/admin/online-enquiries/${id}/create-purchase-draft/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
