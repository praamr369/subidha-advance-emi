import { request } from "@/services/api";

/** Canonical accounting master + readiness payload (GET /admin/accounting/setup/status/). */
export type AccountingSetupStatusPayload = {
  status?: string;
  warnings_count?: number;
  warnings?: { code: string; message: string }[];
  last_validated_at?: string;
  coa_ready?: boolean;
  finance_accounts_ready?: boolean;
  mappings_complete?: boolean;
  missing_required_accounts?: string[];
  missing_required_mappings?: string[];
  required_coa_system_codes?: string[];
  required_mapping_purposes?: string[];
  ledger_anchor_present?: boolean;
  real_settlement_accounts_present?: boolean;
  chart_accounts_total?: number;
  chart_accounts_active?: number;
  chart_accounts_inactive?: number;
  chart_accounts_root?: number;
  chart_accounts_child?: number;
  chart_accounts_active_root?: number;
  chart_accounts_active_child?: number;
  finance_accounts_total?: number;
  finance_accounts_active?: number;
  finance_accounts_inactive?: number;
  required_system_accounts_total?: number;
  required_system_accounts_present?: number;
  required_system_accounts_missing?: string[];
  required_mappings_total?: number;
  required_mappings_complete?: number;
  required_mappings_missing?: string[];
  journals_configured?: boolean;
  journal_ready?: boolean;
  setup_complete?: boolean;
  blocking_reasons?: string[];
  setup_health_status?: "OK" | "WARNING" | "BLOCKED" | string;
  setup_health_blockers_count?: number;
  setup_health_warnings_count?: number;
  posting_readiness?: "READY" | "BLOCKED" | string;
  reconciliation_readiness?: "READY" | "BLOCKED" | string;
};

export async function getAccountingSetupStatus(): Promise<AccountingSetupStatusPayload> {
  return request<AccountingSetupStatusPayload>("/admin/accounting/setup/status/");
}

export async function postAccountingSetupBootstrap(dryRun = false) {
  return request("/admin/accounting/setup/bootstrap/", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
  });
}

export async function getFinanceAccountMappings() {
  return request("/admin/accounting/finance-account-mappings/");
}

export async function createFinanceAccountMapping(payload: Record<string, unknown>) {
  return request("/admin/accounting/finance-account-mappings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchFinanceAccountMapping(id: number, payload: Record<string, unknown>) {
  return request(`/admin/accounting/finance-account-mappings/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAccountingMappingSuggestions() {
  return request("/admin/accounting/mapping-suggestions/");
}

export async function repairSuggestedMappings(dryRun = false) {
  return request("/admin/accounting/mapping-suggestions/repair/", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
  });
}
