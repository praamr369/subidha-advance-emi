import { request } from "@/services/api";

export type AccountingSetupReadinessChartAccount = {
  id: number;
  code: string;
  name: string;
  type?: string;
  account_type?: string;
  is_active?: boolean;
  allow_manual_posting?: boolean;
  is_posting?: boolean;
  is_posting_ready?: boolean;
  is_group_control?: boolean;
  parent?: { id?: number | null; code?: string | null; name?: string | null } | null;
  allowed_for_cash_collection?: boolean;
  allowed_for_bank_collection?: boolean;
  allowed_for_upi_collection?: boolean;
  allowed_for_collection?: boolean;
};

export type AccountingSetupReadinessFinanceAccount = {
  id: number;
  name: string;
  code?: string;
  kind: "CASH" | "BANK" | "UPI" | string;
  branch?: { id?: number | null; code?: string | null; name?: string | null } | null;
  mapped_chart_account?: AccountingSetupReadinessChartAccount | null;
  suggested_chart_account?: AccountingSetupReadinessChartAccount | null;
  can_auto_create_posting_account?: boolean;
  operational_collection_account?: boolean;
  system_posting_profile?: boolean;
  diagnostic_only?: boolean;
  collection_ready: boolean;
  selectable_for_collection?: boolean;
  is_selectable_collection_account?: boolean;
  blocker_reason?: string | null;
  collection_blocker_reason?: string | null;
  recommended_action?: string | null;
  account_role?: string;
};

export type PostingProfileReadinessItem = {
  key: string;
  label: string;
  status: "READY" | "BLOCKED" | "PARTIAL" | "DEFERRED" | string;
  required_debit_account: string[];
  required_credit_account: string[];
  configured_debit_account: AccountingSetupReadinessChartAccount[];
  configured_credit_account: AccountingSetupReadinessChartAccount[];
  blockers: string[];
  recommended_action?: string | null;
  recommended_actions?: string[];
  implemented: boolean;
};

export type AccountingSetupMatrixPayload = {
  modules: unknown[];
  finance_accounts: AccountingSetupReadinessFinanceAccount[];
  operational_collection_accounts: AccountingSetupReadinessFinanceAccount[];
  diagnostic_system_accounts: AccountingSetupReadinessFinanceAccount[];
  chart_accounts: AccountingSetupReadinessChartAccount[];
  chart_of_accounts_health: {
    group_control_accounts: AccountingSetupReadinessChartAccount[];
    posting_leaf_accounts: AccountingSetupReadinessChartAccount[];
    missing_posting_leaf_accounts: AccountingSetupReadinessChartAccount[];
    inactive_or_non_posting_blockers: AccountingSetupReadinessChartAccount[];
    counts: Record<string, number>;
  };
  posting_profiles: Array<{
    id?: number;
    key: string;
    label: string;
    description?: string;
    is_active?: boolean;
    is_system_only?: boolean;
    diagnostic_only?: boolean;
    selectable_for_collection?: boolean;
    collection_ready?: boolean;
    collection_blocker_reason?: string | null;
    chart_account?: AccountingSetupReadinessChartAccount | null;
    ready?: boolean;
    status?: string;
  }>;
  posting_profile_readiness: PostingProfileReadinessItem[];
  collection_requirements?: unknown[];
  operator_copy?: Record<string, string>;
  not_exposed_label?: string;
  summary: Record<string, number>;
};

export type AccountingSetupReadinessPayload = {
  finance_accounts: AccountingSetupReadinessFinanceAccount[];
  chart_accounts: AccountingSetupReadinessChartAccount[];
  summary: {
    cash_accounts_ready_count: number;
    bank_accounts_ready_count: number;
    upi_accounts_ready_count: number;
    blockers_count: number;
    warnings_count: number;
  };
};

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

export type CollectionRepairPreviewPayload = {
  dry_run: boolean;
  historical_mutation: boolean;
  risk_note: string;
  confirmation_text_required: string;
  accounts: Array<Record<string, unknown>>;
  blocked_accounts: Array<Record<string, unknown>>;
  repairable_accounts: Array<Record<string, unknown>>;
  summary: Record<string, number>;
};

export async function getAccountingSetupStatus(): Promise<AccountingSetupStatusPayload> {
  return request<AccountingSetupStatusPayload>("/admin/accounting/setup/status/");
}

export async function getAccountingSetupReadiness(): Promise<AccountingSetupReadinessPayload> {
  return request<AccountingSetupReadinessPayload>("/admin/accounting/setup/readiness/");
}

export async function getAccountingSetupMatrix(): Promise<AccountingSetupMatrixPayload> {
  return request<AccountingSetupMatrixPayload>("/admin/accounting/setup/matrix/");
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

export async function updateFinanceAccountMapping(
  id: number,
  payload: { chart_account_id?: number; auto_create_posting_account?: boolean },
) {
  return request(`/admin/accounting/finance-accounts/${id}/mapping/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function getAccountingMappingSuggestions() {
  return request("/admin/accounting/mapping-suggestions/");
}

export async function getCollectionRepairPreview(): Promise<CollectionRepairPreviewPayload> {
  return request<CollectionRepairPreviewPayload>("/admin/accounting/mapping-suggestions/repair/");
}

export async function repairSuggestedMappings(dryRun = false) {
  return request("/admin/accounting/mapping-suggestions/repair/", {
    method: "POST",
    body: JSON.stringify({ dry_run: dryRun }),
  });
}

export async function executeCollectionMappingRepair(confirmationText: string, financeAccountId?: number) {
  return request("/admin/accounting/mapping-suggestions/repair/", {
    method: "POST",
    body: JSON.stringify({
      dry_run: false,
      confirmation_text: confirmationText,
      ...(financeAccountId ? { finance_account_id: financeAccountId } : {}),
    }),
  });
}
