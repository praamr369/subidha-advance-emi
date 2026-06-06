import { request } from "@/services/api";

export type AccountingBridgeReadinessSummary = {
  ready_count: number;
  info_count?: number;
  warning_count?: number;
  error_count?: number;
  not_configured_count?: number;
  postable_count?: number;
  ready_unposted_count?: number;
  posted_count?: number;
  reconciled_count?: number;
  blocked_count?: number;
  blocked_by_mapping_count?: number;
  blocked_by_period_count?: number;
  blocked_by_numbering_count?: number;
  blocked_by_approval_count?: number;
  unsupported_source_count?: number;
  source_count?: number;
  status_counts?: Record<string, number>;
};

export type AccountingBridgeReadinessAccount = {
  id?: number;
  code?: string;
  name?: string;
  account_type?: string;
  kind?: string;
  purpose?: string | null;
  requirement?: string | null;
  is_active?: boolean;
  is_real_settlement_account?: boolean;
  chart_account?: AccountingBridgeReadinessAccount | null;
};

export type AccountingBridgeReadinessEvent = {
  event_key: string;
  label: string;
  event_label?: string;
  module?: string;
  source_module: string;
  event_group?: string;
  source_model?: string;
  supported?: boolean;
  source_workflow_exists?: boolean;
  mapping_ready?: boolean;
  coa_ready?: boolean;
  finance_account_ready?: boolean;
  posting_profile_ready?: boolean;
  approval_ready?: boolean;
  active_financial_year_ready?: boolean;
  accounting_period_ready?: boolean;
  journal_numbering_ready?: boolean;
  reconciliation_ready?: boolean;
  can_preview?: boolean;
  can_post: boolean;
  can_reconcile?: boolean;
  status: string;
  blocker_code?: string | null;
  blocker_reason?: string | null;
  recommended_action?: string | null;
  action_href?: string | null;
  setup_href?: string | null;
  posting_mode: string;
  debit_requirements?: string[];
  credit_requirements?: string[];
  debit_accounts: AccountingBridgeReadinessAccount[];
  credit_accounts: AccountingBridgeReadinessAccount[];
  finance_accounts: AccountingBridgeReadinessAccount[];
  blocking_reasons: string[];
  operator_action: string;
};

export type AccountingBridgeReadinessPayload = {
  summary: AccountingBridgeReadinessSummary;
  canonical_statuses?: string[];
  financial_year_readiness?: AccountingBridgePeriodReadiness | null;
  accounting_period_readiness?: AccountingBridgePeriodReadiness | null;
  events: AccountingBridgeReadinessEvent[];
};

export type AccountingBridgePeriodReadiness = {
  reference_date?: string;
  financial_year_ready?: boolean;
  accounting_period_ready?: boolean;
  journal_numbering_ready?: boolean;
  posting_controls_ready?: boolean;
  active_financial_year?: {
    id: number;
    code: string;
    name?: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
  } | null;
  current_period?: {
    id: number;
    code: string;
    name?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
    is_locked?: boolean;
  } | null;
  blockers?: string[];
  warnings?: string[];
};

export async function getAccountingBridgeReadiness(): Promise<AccountingBridgeReadinessPayload> {
  return request<AccountingBridgeReadinessPayload>("/admin/accounting/bridge-readiness/");
}
