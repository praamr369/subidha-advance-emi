import { apiFetch } from "@/lib/api";
import {
  downloadAccountingExportCsv,
  fetchAccountingExportIndex as fetchExistingAccountingExportIndex,
  fetchBridgeAuditExport,
  fetchJournalExport,
  fetchLedgerExport,
  fetchLiabilityExport,
  fetchReceivablesExport,
  fetchTrialBalanceExport,
  type AccountingExportIndex,
  type AccountingExportPayload,
  type AccountingExportRow,
} from "@/services/accounting";

export type FinancialStatus = "OK" | "INFO" | "WARNING" | "CRITICAL";

export type FinancialActionItem = {
  key: string;
  severity: Exclude<FinancialStatus, "OK">;
  title: string;
  description: string;
  source_area: string;
  count: number;
  amount?: string | null;
  action_url?: string | null;
  deferred?: boolean;
  metadata?: Record<string, unknown>;
};

export type FinancialIntelligenceSection = {
  status: FinancialStatus;
  message?: string;
  deferred?: boolean;
  warnings?: string[];
  [key: string]: unknown;
};

export type FinancialIntelligenceSnapshot = {
  as_of: string;
  period: { year: number; month: number };
  overall_status: FinancialStatus;
  sections: {
    collection: FinancialIntelligenceSection;
    billing: FinancialIntelligenceSection;
    bridge: FinancialIntelligenceSection;
    reconciliation: FinancialIntelligenceSection;
    advance_deposit: FinancialIntelligenceSection;
    control: FinancialIntelligenceSection;
    inventory_finance: FinancialIntelligenceSection;
    trial_balance?: FinancialIntelligenceSection;
  };
  action_items: FinancialActionItem[];
};

export type FinancialCheck = {
  key: string;
  label?: string;
  title?: string;
  status: FinancialStatus;
  severity?: Exclude<FinancialStatus, "OK">;
  message: string;
  count: number;
  amount?: string;
  source_area?: string;
  action_url?: string | null;
  deferred?: boolean;
  metadata?: Record<string, unknown>;
};

export type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  is_active: boolean;
  normal_balance: string | null;
  opening_debit: string;
  opening_credit: string;
  period_debit: string;
  period_credit: string;
  closing_debit: string;
  closing_credit: string;
  net_balance: string;
  status: FinancialStatus;
  metadata?: Record<string, unknown>;
};

export type TrialBalanceCheckResponse = {
  as_of: string;
  period: { year: number; month: number };
  period_start: string;
  period_end: string;
  total_debit: string;
  total_credit: string;
  difference: string;
  is_balanced: boolean;
  status: FinancialStatus;
  critical_check_count: number;
  rows: TrialBalanceRow[];
  checks: FinancialCheck[];
  action_items: FinancialActionItem[];
};

export type CustomerAdvanceReconciliation = FinancialIntelligenceSection & {
  source_available: boolean;
  total_advance_collected?: string;
  total_advance_applied?: string;
  total_advance_refunded?: string;
  expected_liability?: string;
  unapplied_balance?: string;
  posted_liability_balance?: string | null;
  difference?: string;
  mismatch_count?: number;
  bridge_gap_count?: number;
  stale_unapplied_count?: number;
  checks: FinancialCheck[];
};

export type SecurityDepositReconciliation = FinancialIntelligenceSection & {
  source_available: boolean;
  total_deposit_collected?: string;
  total_deposit_refunded?: string;
  total_deposit_deducted?: string;
  expected_deposit_liability?: string;
  posted_deposit_liability_balance?: string | null;
  unposted_collection_count?: number;
  unposted_refund_count?: number;
  unposted_deduction_count?: number;
  active_contract_deposit_gap_count?: number;
  mismatch_count?: number;
  checks: FinancialCheck[];
};

export type LiabilityReconciliationResponse = {
  as_of: string;
  period: { year: number; month: number };
  overall_status: FinancialStatus;
  customer_advance: CustomerAdvanceReconciliation;
  security_deposit: SecurityDepositReconciliation;
  checks: FinancialCheck[];
  action_items: FinancialActionItem[];
  metadata: Record<string, unknown>;
};

export type AccountingExportReport = AccountingExportPayload;
export type { AccountingExportIndex, AccountingExportRow };

export type FinancialPeriodParams = {
  year?: number | null;
  month?: number | null;
  as_of?: string | null;
};

export type AccountingExportKey =
  | "trial-balance"
  | "journals"
  | "ledgers"
  | "receivables"
  | "liabilities"
  | "bridge-audit";

function query(params: FinancialPeriodParams): string {
  const search = new URLSearchParams();
  if (params.year != null) search.set("year", String(params.year));
  if (params.month != null) search.set("month", String(params.month));
  if (params.as_of) search.set("as_of", params.as_of);
  const value = search.toString();
  return value ? `?${value}` : "";
}

export function fetchFinancialIntelligence(params: FinancialPeriodParams = {}) {
  return apiFetch<FinancialIntelligenceSnapshot>(
    `/admin/financial-intelligence/${query(params)}`
  );
}

export function fetchTrialBalanceCheck(params: FinancialPeriodParams = {}) {
  return apiFetch<TrialBalanceCheckResponse>(
    `/admin/financial-intelligence/trial-balance/${query(params)}`
  );
}

export function fetchLiabilityReconciliation(params: FinancialPeriodParams = {}) {
  return apiFetch<LiabilityReconciliationResponse>(
    `/admin/financial-intelligence/liability-reconciliation/${query(params)}`
  );
}

export function fetchAccountingExportIndex(params: FinancialPeriodParams = {}) {
  return fetchExistingAccountingExportIndex(params);
}

const EXPORT_FETCHERS: Record<
  AccountingExportKey,
  (params: FinancialPeriodParams) => Promise<AccountingExportReport>
> = {
  "trial-balance": fetchTrialBalanceExport,
  journals: fetchJournalExport,
  ledgers: fetchLedgerExport,
  receivables: fetchReceivablesExport,
  liabilities: fetchLiabilityExport,
  "bridge-audit": fetchBridgeAuditExport,
};

export function fetchAccountingExport(
  reportKey: AccountingExportKey,
  params: FinancialPeriodParams = {}
) {
  return EXPORT_FETCHERS[reportKey](params);
}

export function downloadAccountingExport(
  reportKey: AccountingExportKey,
  params: FinancialPeriodParams = {}
) {
  return downloadAccountingExportCsv(reportKey, params);
}
