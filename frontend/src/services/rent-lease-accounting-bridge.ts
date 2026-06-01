import { apiFetch } from "@/lib/api";

export type AccountingReadiness = {
  status: string;
  source_collection_enabled: boolean;
  accounting_bridge_enabled: boolean;
  blockers: string[];
  mapping?: Record<string, unknown> | null;
  counters?: Record<string, number>;
};

export type AccountMappingResponse = {
  mapping: Record<string, unknown> | null;
  readiness: AccountingReadiness;
  chart_accounts: Array<{ id: number; code: string; name: string; account_type: string }>;
  finance_accounts: Array<{ id: number; name: string; kind: string; chart_account_id?: number; chart_account_type?: string }>;
  guidance: Record<string, string>;
};

export function getAccountingReadiness() {
  return apiFetch<AccountingReadiness>("/admin/accounting/readiness/");
}

export function getAdminRentLeaseAccountMappingBridge() {
  return apiFetch<AccountMappingResponse>("/admin/finance/account-mapping/");
}

export function saveAdminRentLeaseAccountMappingBridge(input: Record<string, unknown>) {
  return apiFetch<{ detail: string; mapping_id: number; readiness: AccountingReadiness }>("/admin/finance/account-mapping/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRentLeaseAccountingSummary() {
  return apiFetch<{
    readiness: AccountingReadiness;
    demand_records: number;
    monthly_collected_sources: number;
    deposit_collected_sources: number;
    posting_bridge: Record<string, number>;
    not_used: { lucky_ids: boolean; draws: boolean };
  }>("/admin/rent-lease/accounting-summary/");
}
