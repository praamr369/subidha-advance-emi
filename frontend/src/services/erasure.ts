import { apiFetch } from "@/lib/api";

export type ErasureRequestStatus = "RECEIVED" | "UNDER_REVIEW" | "PARTIALLY_COMPLETED" | "COMPLETED" | "REJECTED";

export type ErasureRequest = {
  id: number;
  customer_id: number;
  customer_name: string | null;
  status: ErasureRequestStatus;
  request_reference: string;
  requested_at: string | null;
  due_date: string;
  is_overdue: boolean;
  fields_to_erase: string[];
  fields_retained: { field: string; reason: string }[];
  reviewed_by: string | null;
  completed_at: string | null;
  rejection_reason: string;
  audit_notes: string;
};

export type ErasurePreview = {
  erasure_guard_id: number;
  customer_id: number;
  customer_name: string;
  status: string;
  due_date: string;
  is_overdue: boolean;
  fields_to_erase: { field: string; current_value: string; action: string }[];
  fields_retained: { field: string; reason: string }[];
};

type ListResponse = { count: number; results: ErasureRequest[] };

export async function listErasureRequests(): Promise<ErasureRequest[]> {
  const data = await apiFetch<ListResponse>("/admin/privacy/erasure-requests/");
  return data.results ?? [];
}

export function createErasureRequest(
  customerId: number,
): Promise<{ id: number; request_reference: string; due_date: string }> {
  return apiFetch("/admin/privacy/erasure-requests/", {
    method: "POST",
    body: JSON.stringify({ customer_id: customerId }),
  });
}

export function getErasurePreview(id: number): Promise<ErasurePreview> {
  return apiFetch<ErasurePreview>(`/admin/privacy/erasure-requests/${id}/preview/`);
}

export function executeErasure(id: number): Promise<{
  erasure_guard_id: number;
  status: string;
  customer_id: number;
  anonymized_name: string;
  kyc_docs_deleted: number;
  fields_retained_count: number;
}> {
  return apiFetch(`/admin/privacy/erasure-requests/${id}/execute/`, { method: "POST" });
}

export function rejectErasure(
  id: number,
  reason: string,
): Promise<{ erasure_guard_id: number; status: string }> {
  return apiFetch(`/admin/privacy/erasure-requests/${id}/reject/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
