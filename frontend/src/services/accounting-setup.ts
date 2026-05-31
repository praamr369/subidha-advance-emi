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

const SYSTEM_PROFILE_BLOCKER = "System posting profile diagnostic only; not a customer collection destination.";
const BLOCKED_PROFILE_ACTION = "Run Accounting Setup defaults or map the required posting accounts before marking this workflow ready.";

const PROFILE_ROWS: Array<{ key: string; label: string; debit: string[]; credit: string[]; implemented: boolean; deferred?: string }> = [
  { key: "emi_collection", label: "EMI Collection", debit: ["CUSTOMER_RECEIVABLE"], credit: ["EMI_INCOME"], implemented: true },
  { key: "direct_sale_collection", label: "Direct Sale Collection", debit: ["CUSTOMER_RECEIVABLE"], credit: ["DIRECT_SALE_INCOME"], implemented: true },
  { key: "customer_advance", label: "Customer Advance", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["CUSTOMER_ADVANCE_UNEARNED_REVENUE"], implemented: true },
  { key: "rent_lease_collection", label: "Rent / Lease Collection", debit: ["CUSTOMER_RECEIVABLE"], credit: ["RENT_INCOME", "LEASE_INCOME"], implemented: false, deferred: "Rent/lease collection remains deferred until an approved backend collection route exists." },
  { key: "security_deposit", label: "Security Deposit", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["SECURITY_DEPOSIT_LIABILITY"], implemented: false, deferred: "Security deposit collection is diagnostic until backend collection execution is enabled." },
  { key: "refund_customer_credit", label: "Refund / Customer Credit", debit: ["CUSTOMER_RECEIVABLE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "commission_payout", label: "Commission Payout", debit: ["COMMISSION_EXPENSE"], credit: ["COMMISSION_PAYABLE"], implemented: true },
  { key: "vendor_payment", label: "Vendor Payment", debit: ["ACCOUNTS_PAYABLE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "purchase_inventory", label: "Purchase / Inventory", debit: ["INVENTORY_ASSET"], credit: ["ACCOUNTS_PAYABLE"], implemented: true },
  { key: "reconciliation_clearing", label: "Reconciliation Clearing", debit: ["CUSTOMER_RECEIVABLE"], credit: ["CUSTOMER_RECEIVABLE"], implemented: true },
];

function normalizeFinanceAccount(account: AccountingSetupReadinessFinanceAccount): AccountingSetupReadinessFinanceAccount {
  return {
    ...account,
    operational_collection_account: account.diagnostic_only ? false : true,
    selectable_for_collection: Boolean(account.selectable_for_collection ?? account.is_selectable_collection_account ?? account.collection_ready),
    is_selectable_collection_account: Boolean(account.selectable_for_collection ?? account.is_selectable_collection_account ?? account.collection_ready),
  };
}

function chartIsPostingLeaf(account: AccountingSetupReadinessChartAccount): boolean {
  return Boolean(account.is_posting || account.is_posting_ready || account.allowed_for_collection);
}

function chartIsGroupControl(account: AccountingSetupReadinessChartAccount): boolean {
  return Boolean(account.is_group_control || !account.allow_manual_posting || !chartIsPostingLeaf(account));
}

function buildCoaHealth(chartAccounts: AccountingSetupReadinessChartAccount[]): AccountingSetupMatrixPayload["chart_of_accounts_health"] {
  const groupControl = chartAccounts.filter(chartIsGroupControl);
  const postingLeaf = chartAccounts.filter(chartIsPostingLeaf);
  const missingLeafAssets = chartAccounts.filter((account) => (account.account_type || account.type) === "ASSET" && !chartIsPostingLeaf(account));
  const inactiveOrNonPosting = chartAccounts.filter((account) => account.is_active === false || !chartIsPostingLeaf(account));
  return {
    group_control_accounts: groupControl,
    posting_leaf_accounts: postingLeaf,
    missing_posting_leaf_accounts: missingLeafAssets,
    inactive_or_non_posting_blockers: inactiveOrNonPosting,
    counts: {
      group_control_count: groupControl.length,
      posting_leaf_count: postingLeaf.length,
      missing_posting_leaf_count: missingLeafAssets.length,
      inactive_or_non_posting_count: inactiveOrNonPosting.length,
    },
  };
}

function buildProfileReadiness(): PostingProfileReadinessItem[] {
  return PROFILE_ROWS.map((row) => ({
    key: row.key,
    label: row.label,
    status: row.implemented ? "BLOCKED" : "DEFERRED",
    required_debit_account: row.debit,
    required_credit_account: row.credit,
    configured_debit_account: [],
    configured_credit_account: [],
    blockers: [row.deferred || "Required posting profile mapping is not exposed by the current readiness endpoint."],
    recommended_action: row.deferred || BLOCKED_PROFILE_ACTION,
    recommended_actions: [row.deferred || BLOCKED_PROFILE_ACTION],
    implemented: row.implemented,
  }));
}

function buildMatrixFromReadiness(payload: AccountingSetupReadinessPayload): AccountingSetupMatrixPayload {
  const financeAccounts = (payload.finance_accounts ?? []).map(normalizeFinanceAccount);
  const operational = financeAccounts.filter((account) => !account.diagnostic_only && !account.system_posting_profile);
  const diagnostic: AccountingSetupReadinessFinanceAccount[] = [
    {
      id: -1,
      name: "Ledger posting profiles (system)",
      code: "SYSTEM-POSTING-PROFILES",
      kind: "SYSTEM",
      mapped_chart_account: null,
      diagnostic_only: true,
      system_posting_profile: true,
      operational_collection_account: false,
      collection_ready: false,
      selectable_for_collection: false,
      is_selectable_collection_account: false,
      collection_blocker_reason: SYSTEM_PROFILE_BLOCKER,
      recommended_action: "Review this row in System Posting Profiles, not in customer collection selectors.",
      account_role: "system_posting_profile",
    },
  ];
  const coaHealth = buildCoaHealth(payload.chart_accounts ?? []);
  return {
    modules: [],
    finance_accounts: financeAccounts,
    operational_collection_accounts: operational,
    diagnostic_system_accounts: diagnostic,
    chart_accounts: payload.chart_accounts ?? [],
    chart_of_accounts_health: coaHealth,
    posting_profiles: diagnostic.map((account) => ({
      key: account.code || "system_posting_profiles",
      label: account.name,
      diagnostic_only: true,
      selectable_for_collection: false,
      collection_ready: false,
      collection_blocker_reason: SYSTEM_PROFILE_BLOCKER,
      status: "BLOCKED",
    })),
    posting_profile_readiness: buildProfileReadiness(),
    collection_requirements: [],
    operator_copy: {
      finance_accounts: "Finance Accounts are where money is received or paid.",
      posting_profiles: "Posting Profiles decide which ledger accounts are debited and credited.",
      chart_of_accounts: "Chart of Accounts is the ledger structure.",
      system_profiles: "System posting profiles are diagnostic only and cannot receive customer collections.",
      blocked_collection: "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.",
    },
    not_exposed_label: "Not exposed",
    summary: {
      ...payload.summary,
      selectable_collection_accounts_count: operational.filter((account) => account.selectable_for_collection).length,
      operational_collection_accounts_count: operational.length,
      diagnostic_system_accounts_count: diagnostic.length,
    },
  };
}

export async function getAccountingSetupStatus(): Promise<AccountingSetupStatusPayload> {
  return request<AccountingSetupStatusPayload>("/admin/accounting/setup/status/");
}

export async function getAccountingSetupReadiness(): Promise<AccountingSetupReadinessPayload> {
  return request<AccountingSetupReadinessPayload>("/admin/accounting/setup/readiness/");
}

export async function getAccountingSetupMatrix(): Promise<AccountingSetupMatrixPayload> {
  const payload = await getAccountingSetupReadiness();
  return buildMatrixFromReadiness(payload);
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
