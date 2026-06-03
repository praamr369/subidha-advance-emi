import { request } from "@/services/api";

export type AccountingBridgeReadinessSummary = {
  ready_count: number;
  info_count: number;
  warning_count: number;
  error_count: number;
  not_configured_count: number;
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
  chart_account?: AccountingBridgeReadinessAccount | null;
};

export type AccountingBridgeReadinessEvent = {
  event_key: string;
  label: string;
  source_module: string;
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
  repairable: boolean;
};

export type AccountingBridgeReadinessPayload = {
  summary: AccountingBridgeReadinessSummary;
  events: AccountingBridgeReadinessEvent[];
};

export async function getAccountingBridgeReadiness(): Promise<AccountingBridgeReadinessPayload> {
  return request<AccountingBridgeReadinessPayload>("/admin/accounting/bridge-readiness/");
}
