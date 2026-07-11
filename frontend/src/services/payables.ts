import { apiFetch } from "@/lib/api";

export type PayableType =
  | "salary"
  | "vendor_settlement"
  | "commission"
  | "expense_claim"
  | "credit_refund";

export interface PayableItem {
  id: string;
  payable_type: PayableType;
  payable_type_label: string;
  payable_id: number;
  reference: string;
  party_name: string;
  party_type: string;
  amount: string;
  outstanding: string;
  status: string;
  date: string | null;
  journal_posted: boolean;
  notes: string;
}

export interface TypeSummary {
  payable_type: PayableType;
  label: string;
  count: number;
  total: string;
}

export interface UnifiedPayableData {
  total_items: number;
  total_outstanding: string;
  type_summary: TypeSummary[];
  items: PayableItem[];
}

export interface FinanceAccount {
  id: number;
  name: string;
  kind: "CASH" | "BANK" | "UPI";
  branch_id: number | null;
  branch_name: string | null;
}

export interface PayableExecuteRequest {
  payable_type: PayableType;
  payable_id: number;
  finance_account_id?: number | null;
  amount: string;
  payment_date?: string | null;
  reference_no?: string;
  notes?: string;
}

export interface PayableExecuteResult {
  success: boolean;
  payable_type: string;
  payable_id: number;
  amount_paid: string;
  journal_entry_id: number | null;
  message: string;
}

export async function getUnifiedPayables(params?: {
  payable_type?: string;
  search?: string;
}): Promise<UnifiedPayableData> {
  const qs = new URLSearchParams();
  if (params?.payable_type) qs.set("payable_type", params.payable_type);
  if (params?.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch<UnifiedPayableData>(`/admin/payables/${suffix}`);
}

export async function getPayableFinanceAccounts(): Promise<FinanceAccount[]> {
  return apiFetch<FinanceAccount[]>("/admin/payables/finance-accounts/");
}

export async function executePayable(
  payload: PayableExecuteRequest
): Promise<PayableExecuteResult> {
  return apiFetch<PayableExecuteResult>("/admin/payables/execute/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
