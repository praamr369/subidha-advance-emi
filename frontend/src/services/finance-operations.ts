import { apiFetch } from "@/lib/api";

type FinanceOperationEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export type FinanceOperationalSummaryRow = {
  finance_account_id: number;
  finance_account_name: string;
  kind: "CASH" | "BANK" | "UPI";
  branch_id?: number | null;
  branch_name?: string | null;
  chart_account_id: number;
  chart_account_code: string;
  payment_total: string;
  payment_count: number;
  advance_total: string;
  advance_count: number;
  unapplied_advance_total: string;
  incoming_transfer_total: string;
  incoming_transfer_count: number;
  outgoing_transfer_total: string;
  outgoing_transfer_count: number;
  pending_settlement_amount: string;
  reconciliation_status: "PENDING" | "RECONCILED" | "PARTIAL" | "EXCEPTION" | string;
};

export type FinanceOperationalSummaryResponse = {
  count: number;
  results: FinanceOperationalSummaryRow[];
};

export type ReconciliationOverviewResponse = {
  pending_finance_accounts: number;
  pending_settlement_amount: string;
  unapplied_advance_total: string;
  flagged_reconciliation_count: number;
  pending_accounts: FinanceOperationalSummaryRow[];
};

export type FinanceTransferRecord = {
  id: number;
  movement_no: string;
  movement_date: string;
  from_finance_account_id: number;
  from_finance_account_name: string;
  to_finance_account_id: number;
  to_finance_account_name: string;
  amount: string;
  reference_no?: string | null;
  notes?: string | null;
  status: string;
  posted_journal_entry_id?: number | null;
};

export type FinanceTransferListResponse = {
  count: number;
  results: FinanceTransferRecord[];
};

export type CreateFinanceTransferPayload = {
  movement_date: string;
  from_finance_account_id: number;
  to_finance_account_id: number;
  amount: string;
  reference_no?: string;
  notes?: string;
};

export type CreateFinanceTransferResult = {
  transfer_id: number;
  movement_no: string;
  amount: string;
  status: string;
  from_finance_account_id: number;
  to_finance_account_id: number;
  posted_journal_entry_id?: number | null;
  created: boolean;
};

function unwrapEnvelope<T>(payload: FinanceOperationEnvelope<T> | T): T {
  if (payload && typeof payload === "object" && "data" in (payload as Record<string, unknown>)) {
    return ((payload as FinanceOperationEnvelope<T>).data ?? null) as T;
  }
  return payload as T;
}

export async function getFinanceOperationalSummary() {
  return apiFetch<FinanceOperationalSummaryResponse>(
    "/admin/finance-accounts/operational-summary/"
  );
}

export async function getReconciliationOverview() {
  return apiFetch<ReconciliationOverviewResponse>("/admin/reconciliation/overview/");
}

export async function listFinanceTransfers() {
  return apiFetch<FinanceTransferListResponse>("/admin/finance-transfers/");
}

export async function createFinanceTransfer(payload: CreateFinanceTransferPayload) {
  const response = await apiFetch<FinanceOperationEnvelope<CreateFinanceTransferResult>>(
    "/admin/finance-transfers/",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return unwrapEnvelope(response);
}
