import { apiFetch } from "@/lib/api";

export type ReversalCase = {
  id: number;
  case_no: string;
  source_type: string;
  source_id: number | null;
  source_reference: string;
  status: string;
  reversal_type: string;
  reason: string;
  amount_snapshot: string;
  amount: string;
  customer_name?: string | null;
  party_name?: string | null;
  reconciliation_status?: string;
  blocking_reasons?: string[];
  action_summary?: string;
  source_url?: string;
  detail_url?: string;
  customer_url?: string | null;
  related_document_urls?: string[];
  refundable_amount: string;
  customer_credit_amount: string;
  metadata: Record<string, unknown>;
};

type ReversalListResponse = {
  count: number;
  results: ReversalCase[];
};

export async function listReversalCases(q = ""): Promise<ReversalListResponse> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch(`/admin/finance/reversal-cases/${query}`);
}

export async function createReversalCase(payload: Record<string, unknown>): Promise<ReversalCase> {
  return apiFetch("/admin/finance/reversal-cases/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getReversalCaseDetail(id: number): Promise<ReversalCase & Record<string, unknown>> {
  return apiFetch(`/admin/finance/reversal-cases/${id}/`);
}

export async function syncReversalCase(id: number) {
  return apiFetch(`/admin/finance/reversal-cases/${id}/sync/`, { method: "POST" });
}

export async function reconcileReversalCase(id: number, reason: string) {
  return apiFetch(`/admin/finance/reversal-cases/${id}/reconcile/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function closeReversalCase(id: number, reason: string, overrideReason = "") {
  return apiFetch(`/admin/finance/reversal-cases/${id}/close/`, {
    method: "POST",
    body: JSON.stringify({ reason, override_reason: overrideReason }),
  });
}

export async function archiveReversalCase(id: number, reason: string) {
  return apiFetch(`/admin/finance/reversal-cases/${id}/archive/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function fetchReversalReconciliationQueue() {
  return apiFetch<{ summary: Record<string, number>; results: ReversalCase[]; filters: Record<string, string> }>(
    "/admin/finance/reversal-reconciliation/"
  );
}
