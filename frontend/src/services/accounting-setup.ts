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
  is_active?: boolean;
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
  collection_ready?: boolean;
  mapping_ready?: boolean;
  posting_bridge_ready?: boolean;
  posting_bridge_approved?: boolean;
  posting_mode?: "AUDIT_DEFERRED" | "POSTING_ENABLED" | "MANUAL_APPROVAL_REQUIRED" | string;
  message?: string | null;
  operator_action?: string | null;
  required_debit_account: string[];
  required_credit_account: string[];
  configured_debit_account: AccountingSetupReadinessChartAccount[];
  configured_credit_account: AccountingSetupReadinessChartAccount[];
  blockers: string[];
  recommended_action?: string | null;
  recommended_actions?: string[];
  implemented: boolean;
  operator_note?: string | null;
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
  modules?: unknown[];
  operational_collection_accounts?: AccountingSetupReadinessFinanceAccount[];
  diagnostic_system_accounts?: AccountingSetupReadinessFinanceAccount[];
  chart_of_accounts_health?: AccountingSetupMatrixPayload["chart_of_accounts_health"];
  posting_profiles?: AccountingSetupMatrixPayload["posting_profiles"];
  posting_profile_readiness?: PostingProfileReadinessItem[];
  collection_requirements?: unknown[];
  operator_copy?: Record<string, string>;
  not_exposed_label?: string;
  summary: {
    cash_accounts_ready_count: number;
    bank_accounts_ready_count: number;
    upi_accounts_ready_count: number;
    blockers_count: number;
    warnings_count: number;
    [key: string]: number;
  };
};

export type AccountingSetupStatusPayload = {
  status: "READY" | "NEEDS_ATTENTION" | string;
  warnings_count: number;
  warnings: Array<{ level: string; code: string; message: string; affected_ids?: number[]; repairable?: boolean; operator_action?: string }>;
  last_validated_at: string;
  coa_ready: boolean;
  finance_accounts_ready: boolean;
  mappings_complete: boolean;
  missing_required_accounts: string[];
  missing_required_mappings: string[];
  required_coa_system_codes: string[];
  required_mapping_purposes: string[];
  ledger_anchor_present: boolean;
  real_settlement_accounts_present: boolean;
  chart_accounts_total: number;
  chart_accounts_active: number;
  chart_accounts_inactive: number;
  chart_accounts_root: number;
  chart_accounts_child: number;
  chart_accounts_active_root: number;
  chart_accounts_active_child: number;
  finance_accounts_total: number;
  finance_accounts_active: number;
  finance_accounts_inactive: number;
  required_system_accounts_total: number;
  required_system_accounts_present: number;
  required_system_accounts_missing: string[];
  required_mappings_total: number;
  required_mappings_complete: number;
  required_mappings_missing: string[];
  setup_complete: boolean;
  journal_ready: boolean;
  blocking_reasons: string[];
  posting_readiness: "READY" | "BLOCKED" | string;
  reconciliation_readiness: "READY" | "BLOCKED" | string;
  setup_health_status?: string;
  setup_health_blockers_count?: number;
  setup_health_warnings_count?: number;
  bridge_readiness?: Record<string, unknown>;
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
const RENT_LEASE_SOURCE_COLLECTION_COPY = "Operational source collection and mapping are ready. Accounting bridge posting remains audit-deferred until approval is enabled.";
const RENT_LEASE_POSTING_OPERATOR_ACTION = "Enable bridge posting through approved accounting bridge workflow.";

const ACCOUNT_CODES: Record<string, string[]> = {
  CASH_COLLECTION: ["CASH-1000", "CASH-1000-P"],
  BANK_COLLECTION: ["BANK-1010", "BANK-1010-P"],
  UPI_COLLECTION: ["UPI-1020", "UPI-1020-P"],
  PAYMENT_GATEWAY_COLLECTION: ["PGW-1030", "PGW-1030-P"],
  CUSTOMER_RECEIVABLE: ["AR-1000"],
  CUSTOMER_ADVANCE_UNEARNED_REVENUE: ["ADV-2200"],
  EMI_INCOME: ["EMI-4000"],
  EMI_COLLECTION_CLEARING: ["EMI-2100"],
  DIRECT_SALE_INCOME: ["REV-4000"],
  SALES_REVENUE: ["REV-4000"],
  RENT_INCOME: ["RENT-4000"],
  LEASE_INCOME: ["LEASE-4000"],
  SECURITY_DEPOSIT_LIABILITY: ["SEC-2300"],
  DELIVERY_CHARGES_INCOME: ["DEL-4000"],
  DAMAGE_RECOVERY: ["DMG-4000"],
  WAIVER_LOSS: ["EMI-5200"],
  EMI_WAIVER_EXPENSE: ["EMI-5200"],
  COMMISSION_EXPENSE: ["COM-5100"],
  PARTNER_COMMISSION_EXPENSE: ["COM-5100"],
  COMMISSION_PAYABLE: ["COM-2100"],
  PARTNER_COMMISSION_PAYABLE: ["COM-2100"],
  DELIVERY_EXPENSE: ["DEL-5100"],
  SALARY_EXPENSE: ["PAY-5100"],
  SALES_RETURNS: ["REV-4010"],
  ACCOUNTS_PAYABLE: ["AP-2000"],
  INVENTORY_ASSET: ["INV-1200"],
  WORK_IN_PROGRESS_INVENTORY: ["INV-1210"],
  COGS: ["COGS-5000"],
  MANUFACTURING_WASTAGE: ["MFG-5200"],
  INVENTORY_ADJUSTMENT: ["INV-5100"],
  INPUT_GST: ["GST-1100"],
  OUTPUT_GST: ["GST-2100"],
};

const PROFILE_ROWS = [
  { key: "emi_collection", label: "EMI Collection", debit: ["CUSTOMER_RECEIVABLE"], credit: ["EMI_INCOME", "EMI_COLLECTION_CLEARING"], implemented: true },
  { key: "direct_sale_collection", label: "Direct Sale Collection", debit: ["CUSTOMER_RECEIVABLE"], credit: ["DIRECT_SALE_INCOME"], implemented: true },
  { key: "customer_advance", label: "Customer Advance", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["CUSTOMER_ADVANCE_UNEARNED_REVENUE"], implemented: true },
  { key: "rent_lease_collection", label: "Rent / Lease Collection", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["RENT_INCOME", "LEASE_INCOME"], implemented: true, operatorNote: RENT_LEASE_SOURCE_COLLECTION_COPY },
  { key: "security_deposit", label: "Security Deposit", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["SECURITY_DEPOSIT_LIABILITY"], implemented: true, operatorNote: RENT_LEASE_SOURCE_COLLECTION_COPY },
  { key: "refund_customer_credit", label: "Refund / Customer Credit", debit: ["SALES_RETURNS", "CUSTOMER_RECEIVABLE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "commission_payout", label: "Commission Payout", debit: ["COMMISSION_EXPENSE"], credit: ["COMMISSION_PAYABLE"], implemented: true },
  { key: "vendor_payment", label: "Vendor Payment", debit: ["ACCOUNTS_PAYABLE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "purchase_inventory", label: "Purchase / Inventory", debit: ["INVENTORY_ASSET", "INPUT_GST"], credit: ["ACCOUNTS_PAYABLE"], implemented: true },
  { key: "inventory_delivery_out", label: "Inventory Delivery Out", debit: ["COGS"], credit: ["INVENTORY_ASSET"], implemented: true },
  { key: "stock_adjustment", label: "Stock Adjustment", debit: ["INVENTORY_ASSET", "INVENTORY_ADJUSTMENT"], credit: ["INVENTORY_ASSET", "INVENTORY_ADJUSTMENT"], implemented: true },
  { key: "vendor_return", label: "Vendor Return", debit: ["ACCOUNTS_PAYABLE"], credit: ["INVENTORY_ASSET"], implemented: true },
  { key: "reconciliation_clearing", label: "Reconciliation Clearing", debit: ["EMI_COLLECTION_CLEARING", "CUSTOMER_RECEIVABLE"], credit: ["EMI_COLLECTION_CLEARING", "CUSTOMER_RECEIVABLE"], implemented: true },
  { key: "settlement_allocation", label: "Settlement Allocation", debit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], credit: ["CUSTOMER_RECEIVABLE", "CUSTOMER_ADVANCE_UNEARNED_REVENUE"], implemented: true },
  { key: "payment_gateway_collection", label: "Payment Gateway Collection", debit: ["PAYMENT_GATEWAY_COLLECTION"], credit: ["CUSTOMER_RECEIVABLE"], implemented: true },
  { key: "payment_reversal", label: "Payment Reversal", debit: ["CUSTOMER_RECEIVABLE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "receipt_void", label: "Receipt Void", debit: ["CUSTOMER_RECEIVABLE", "CUSTOMER_ADVANCE_UNEARNED_REVENUE"], credit: ["CASH_COLLECTION", "BANK_COLLECTION", "UPI_COLLECTION"], implemented: true },
  { key: "delivery_charges", label: "Delivery Charges", debit: ["CUSTOMER_RECEIVABLE"], credit: ["DELIVERY_CHARGES_INCOME"], implemented: true },
  { key: "waiver_expense", label: "EMI Waiver Expense", debit: ["WAIVER_LOSS"], credit: ["CUSTOMER_RECEIVABLE"], implemented: true },
  { key: "damage_recovery", label: "Damage Recovery", debit: ["CUSTOMER_RECEIVABLE"], credit: ["DAMAGE_RECOVERY"], implemented: true },
  { key: "tax_invoice", label: "Tax Invoice", debit: ["CUSTOMER_RECEIVABLE"], credit: ["DIRECT_SALE_INCOME", "OUTPUT_GST"], implemented: true },
  { key: "credit_debit_notes", label: "Credit / Debit Notes", debit: ["SALES_RETURNS", "CUSTOMER_RECEIVABLE"], credit: ["CUSTOMER_RECEIVABLE", "DIRECT_SALE_INCOME", "DAMAGE_RECOVERY"], implemented: true },
  { key: "manufacturing", label: "Manufacturing", debit: ["WORK_IN_PROGRESS_INVENTORY", "INVENTORY_ASSET", "MANUFACTURING_WASTAGE"], credit: ["INVENTORY_ASSET", "WORK_IN_PROGRESS_INVENTORY", "DAMAGE_RECOVERY"], implemented: true },
  { key: "delivery_expense", label: "Delivery Expense", debit: ["DELIVERY_EXPENSE"], credit: ["ACCOUNTS_PAYABLE"], implemented: true },
  { key: "salary_payroll", label: "Salary / Payroll", debit: ["SALARY_EXPENSE"], credit: ["ACCOUNTS_PAYABLE"], implemented: true },
] as const;

function normalizeFinanceAccount(account: AccountingSetupReadinessFinanceAccount): AccountingSetupReadinessFinanceAccount {
  return {
    ...account,
    operational_collection_account: account.diagnostic_only ? false : true,
    selectable_for_collection: Boolean(account.selectable_for_collection ?? account.is_selectable_collection_account ?? account.collection_ready),
    is_selectable_collection_account: Boolean(account.selectable_for_collection ?? account.is_selectable_collection_account ?? account.collection_ready),
  };
}

function isPostingAccount(account: AccountingSetupReadinessChartAccount): boolean {
  return Boolean(account.is_active !== false && account.allow_manual_posting !== false);
}

function findAccount(key: string, accounts: AccountingSetupReadinessChartAccount[]): AccountingSetupReadinessChartAccount | null {
  const codes = ACCOUNT_CODES[key] ?? [key];
  return accounts.find((account) => codes.includes((account.code || "").toUpperCase()) && isPostingAccount(account)) ?? null;
}

function buildCoaHealth(accounts: AccountingSetupReadinessChartAccount[]): AccountingSetupMatrixPayload["chart_of_accounts_health"] {
  const postingLeaf = accounts.filter(isPostingAccount);
  const nonPosting = accounts.filter((account) => !isPostingAccount(account));
  const missingLeafAssets = accounts.filter((account) => (account.account_type || account.type) === "ASSET" && !isPostingAccount(account));
  return {
    group_control_accounts: nonPosting,
    posting_leaf_accounts: postingLeaf,
    missing_posting_leaf_accounts: missingLeafAssets,
    inactive_or_non_posting_blockers: nonPosting,
    counts: {
      group_control_count: nonPosting.length,
      posting_leaf_count: postingLeaf.length,
      missing_posting_leaf_count: missingLeafAssets.length,
      inactive_or_non_posting_count: nonPosting.length,
    },
  };
}

function buildProfileReadiness(accounts: AccountingSetupReadinessChartAccount[]): PostingProfileReadinessItem[] {
  return PROFILE_ROWS.map((row) => {
    const debit = row.debit.map((key) => findAccount(key, accounts));
    const credit = row.credit.map((key) => findAccount(key, accounts));
    const debitAccounts = debit.filter(Boolean) as AccountingSetupReadinessChartAccount[];
    const creditAccounts = credit.filter(Boolean) as AccountingSetupReadinessChartAccount[];
    const debitMissing = row.debit.filter((_, index) => !debit[index]);
    const creditMissing = row.credit.filter((_, index) => !credit[index]);
    const blockers = [
      ...debitMissing.map((key) => `Debit account ${key} is not configured as posting-ready.`),
      ...creditMissing.map((key) => `Credit account ${key} is not configured as posting-ready.`),
    ];
    const configuredCount = debitAccounts.length + creditAccounts.length;
    const status = !row.implemented ? "DEFERRED" : blockers.length === 0 ? "READY" : configuredCount > 0 ? "PARTIAL" : "BLOCKED";
    const operatorNote = "operatorNote" in row ? row.operatorNote : null;
    const isRentLeaseBridge = row.key === "rent_lease_collection" || row.key === "security_deposit";
    const mappingReady = blockers.length === 0;
    return {
      key: row.key,
      label: row.label,
      status,
      ...(isRentLeaseBridge
        ? {
            collection_ready: true,
            mapping_ready: mappingReady,
            posting_bridge_ready: false,
            posting_bridge_approved: false,
            posting_mode: "AUDIT_DEFERRED",
            message: mappingReady ? RENT_LEASE_SOURCE_COLLECTION_COPY : blockers[0] ?? "Accounting mapping is not ready.",
            operator_action: mappingReady ? RENT_LEASE_POSTING_OPERATOR_ACTION : "Complete rent/lease COA, finance account, and mapping setup.",
          }
        : {}),
      required_debit_account: [...row.debit],
      required_credit_account: [...row.credit],
      configured_debit_account: debitAccounts,
      configured_credit_account: creditAccounts,
      blockers,
      recommended_action: blockers[0] || (isRentLeaseBridge ? RENT_LEASE_SOURCE_COLLECTION_COPY : operatorNote),
      recommended_actions: blockers,
      implemented: row.implemented,
      operator_note: isRentLeaseBridge ? (mappingReady ? RENT_LEASE_SOURCE_COLLECTION_COPY : blockers[0] ?? operatorNote) : operatorNote,
    };
  });
}

function buildMatrixFromReadiness(payload: AccountingSetupReadinessPayload): AccountingSetupMatrixPayload {
  const financeAccounts = (payload.finance_accounts ?? []).map(normalizeFinanceAccount);
  const operational = payload.operational_collection_accounts ?? financeAccounts.filter((account) => !account.diagnostic_only && !account.system_posting_profile);
  const diagnostic = payload.diagnostic_system_accounts ?? [{
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
  }];
  const readiness = payload.posting_profile_readiness ?? buildProfileReadiness(payload.chart_accounts ?? []);
  return {
    modules: payload.modules ?? readiness.map((profile) => ({ module_key: profile.key, label: profile.label, status: profile.status, workflow_active: profile.implemented, collection_action_enabled: profile.implemented && profile.status === "READY", blockers: profile.blockers })),
    finance_accounts: financeAccounts,
    operational_collection_accounts: operational,
    diagnostic_system_accounts: diagnostic,
    chart_accounts: payload.chart_accounts ?? [],
    chart_of_accounts_health: payload.chart_of_accounts_health ?? buildCoaHealth(payload.chart_accounts ?? []),
    posting_profiles: payload.posting_profiles ?? diagnostic.map((account) => ({ key: account.code || "system_posting_profiles", label: account.name, diagnostic_only: true, selectable_for_collection: false, collection_ready: false, collection_blocker_reason: SYSTEM_PROFILE_BLOCKER, status: "BLOCKED" })),
    posting_profile_readiness: readiness,
    collection_requirements: payload.collection_requirements ?? [],
    operator_copy: payload.operator_copy ?? {
      finance_accounts: "Finance Accounts are where money is received or paid.",
      posting_profiles: "Posting Profiles decide which ledger accounts are debited and credited.",
      chart_of_accounts: "Chart of Accounts is the ledger structure.",
      system_profiles: "System posting profiles are diagnostic only and cannot receive customer collections.",
      blocked_collection: "Blocked from collection selectors until mapped to a posting-enabled leaf ASSET account.",
      rent_lease_source_collection: RENT_LEASE_SOURCE_COLLECTION_COPY,
    },
    not_exposed_label: payload.not_exposed_label ?? "Not exposed",
    summary: {
      ...payload.summary,
      ready_count: readiness.filter((row) => row.status === "READY").length,
      blocked_count: readiness.filter((row) => row.status === "BLOCKED").length,
      partial_count: readiness.filter((row) => row.status === "PARTIAL").length,
      deferred_count: readiness.filter((row) => row.status === "DEFERRED").length,
      selectable_collection_accounts_count: operational.filter((account) => account.selectable_for_collection).length,
      operational_collection_accounts_count: operational.length,
      diagnostic_system_accounts_count: diagnostic.length,
    },
  };
}

export async function getAccountingSetupReadiness(): Promise<AccountingSetupReadinessPayload> {
  return request<AccountingSetupReadinessPayload>("/admin/accounting/setup/readiness/");
}

export async function getAccountingSetupStatus(): Promise<AccountingSetupStatusPayload> {
  return request<AccountingSetupStatusPayload>("/admin/accounting/setup/status/");
}

export async function getAccountingSetupMatrix(): Promise<AccountingSetupMatrixPayload> {
  return buildMatrixFromReadiness(await getAccountingSetupReadiness());
}

export async function postAccountingSetupBootstrap(dryRun = false) {
  return request("/admin/accounting/setup/bootstrap/", { method: "POST", body: JSON.stringify({ dry_run: dryRun }) });
}

export async function getFinanceAccountMappings() {
  return request("/admin/accounting/finance-account-mappings/");
}

export async function createFinanceAccountMapping(payload: Record<string, unknown>) {
  return request("/admin/accounting/finance-account-mappings/", { method: "POST", body: JSON.stringify(payload) });
}

export async function patchFinanceAccountMapping(id: number, payload: Record<string, unknown>) {
  return request(`/admin/accounting/finance-account-mappings/${id}/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function updateFinanceAccountMapping(id: number, payload: { chart_account_id?: number; auto_create_posting_account?: boolean }) {
  return request(`/admin/accounting/finance-accounts/${id}/mapping/`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getAccountingMappingSuggestions() {
  return request("/admin/accounting/mapping-suggestions/");
}

export async function getCollectionRepairPreview(): Promise<CollectionRepairPreviewPayload> {
  return request<CollectionRepairPreviewPayload>("/admin/accounting/mapping-suggestions/repair/");
}

export async function repairSuggestedMappings(dryRun = false) {
  return request("/admin/accounting/mapping-suggestions/repair/", { method: "POST", body: JSON.stringify({ dry_run: dryRun }) });
}

export async function executeCollectionMappingRepair(confirmationText: string, financeAccountId?: number) {
  return request("/admin/accounting/mapping-suggestions/repair/", {
    method: "POST",
    body: JSON.stringify({ dry_run: false, confirmation_text: confirmationText, ...(financeAccountId ? { finance_account_id: financeAccountId } : {}) }),
  });
}
