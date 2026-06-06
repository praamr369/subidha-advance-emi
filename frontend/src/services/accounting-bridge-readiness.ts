import { request } from "@/services/api";

export type AccountingBridgeReadinessSummary = {
  ready_count: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  not_configured_count: number;
  postable_count?: number;
  blocked_count?: number;
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
  source_module: string;
  event_group?: string;
  source_model?: string;
  status: string;
  can_post: boolean;
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
