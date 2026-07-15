import { apiFetch } from "@/lib/api";

export type UnifiedCollectionPayload = {
  source_type: string;
  source_id: number;
  amount: string;
  payment_method: "CASH" | "UPI" | "BANK" | "CARD";
  finance_account_id: number;
  reference_no?: string;
  notes?: string;
  receipt_date?: string;
  branch_id?: number | null;
  cash_counter_id?: number | null;
  idempotency_key?: string;
};

export type UnifiedCollectionResponse = {
  detail: string;
  receipt_status: string;
  [key: string]: any;
};

export async function processUnifiedCollection(payload: UnifiedCollectionPayload) {
  return apiFetch<UnifiedCollectionResponse>("/admin/receivables/collect/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
