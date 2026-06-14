import { apiFetch } from "@/lib/api";

export type AccountingBooksReadinessAccount = {
  id: number;
  name: string;
  kind: "CASH" | "BANK" | "UPI" | string;
  branch_id?: number | null;
  branch_code?: string | null;
  branch_name?: string | null;
  chart_account_id?: number | null;
  chart_account_code?: string | null;
  chart_account_name?: string | null;
  chart_account_type?: string | null;
  opening_balance: string;
  is_active: boolean;
  is_real_settlement_account: boolean;
  collection_ready: boolean;
  collection_blocker_reason?: string | null;
  recommended_action?: string | null;
  posting_ready: boolean;
  movement_eligible: boolean;
};

export type AccountingBooksReadiness = {
  status: "READY" | "NEEDS_SETUP";
  blockers: string[];
  warnings: string[];
  counts: {
    finance_accounts_total: number;
    active_finance_accounts: number;
    active_settlement_accounts: number;
    movement_eligible_accounts: number;
    cash_accounts: number;
    bank_accounts: number;
    upi_accounts: number;
    draft_money_movements: number;
    posted_money_movements: number;
    cancelled_money_movements: number;
  };
  movement_eligible_accounts: AccountingBooksReadinessAccount[];
  finance_accounts: AccountingBooksReadinessAccount[];
  safety_note: string;
};

export function getAccountingBooksReadiness() {
  return apiFetch<AccountingBooksReadiness>("/accounting/books/readiness/");
}
