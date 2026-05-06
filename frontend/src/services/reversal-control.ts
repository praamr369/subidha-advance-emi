import { apiFetch } from "@/lib/api";

export type ReversalCase = {
  id: number;
  case_no: string;
  source_type: string;
  source_id: number;
  source_reference: string;
  status: string;
  reversal_type: string;
  reason: string;
  amount_snapshot: string;
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
