import { request } from "@/services/api";

export type AccountingBridgeReconciliationSummary = {
  source_count: number;
  ready_unposted_count: number;
  blocked_count: number;
  blocked_by_mapping_count?: number;
  posted_count: number;
  settled_count: number;
  reconciled_count: number;
  exception_count: number;
  total_invoices?: number;
  total_receipts?: number;
  total_journal_postings?: number;
  total_money_movements?: number;
  unposted_bridge_item_count?: number;
  unreconciled_money_movement_count?: number;
  reconciliation_exception_count?: number;
  blocked_bridge_item_count?: number;
  locked_period_count?: number;
  closed_period_count?: number;
  ready_unposted_by_event?: Record<string, number>;
  blocked_by_mapping_by_event?: Record<string, number>;
  status_counts_by_event?: Record<string, Record<string, number>>;
  blocking_groups?: Array<{
    event_key: string;
    blocker_code: string;
    blocker_label?: string | null;
    count: number;
    recommended_action?: string | null;
    action_href?: string | null;
    is_acknowledgeable?: boolean;
    is_postable?: boolean;
  }>;
};

export type AccountingBridgeReconciliationJournal = {
  id?: number | null;
  entry_no?: string | null;
  entry_date?: string | null;
  status?: string | null;
  financial_year?: number | null;
  financial_year_code?: string | null;
  accounting_period?: number | null;
  accounting_period_code?: string | null;
  accounting_period_name?: string | null;
  accounting_period_status?: string | null;
};

export type AccountingBridgeReconciliationItem = {
  id: number;
  status: string;
  severity: string;
  exception_code?: string;
  exception_message?: string;
};

export type AccountingBridgePeriodReadiness = {
  financial_year_ready?: boolean;
  accounting_period_ready?: boolean;
  journal_numbering_ready?: boolean;
  posting_controls_ready?: boolean;
  active_financial_year?: { id?: number; code?: string; name?: string } | null;
  current_period?: { id?: number; code?: string; name?: string; status?: string } | null;
  blockers?: string[];
};

export type AccountingBridgeReconciliationRow = {
  row_type: string;
  event_key: string;
  label: string;
  module: string;
  event_group?: string;
  source_model?: string | null;
  source_id?: string | null;
  source_reference?: string | null;
  status: string;
  mapping_status?: string;
  posting_mode?: string;
  can_post: boolean;
  is_postable?: boolean;
  is_acknowledgeable?: boolean;
  blocker_code?: string | null;
  blocker_label?: string | null;
  blocker_count?: number;
  recommended_action?: string | null;
  action_href?: string | null;
  preview_action_href?: string | null;
  post_action_href?: string | null;
  source_action_href?: string | null;
  financial_year_id?: number | null;
  accounting_period_id?: number | null;
  journal_entry?: AccountingBridgeReconciliationJournal | null;
  settlement_linked: boolean;
  reconciliation_linked: boolean;
  reconciliation_items: AccountingBridgeReconciliationItem[];
  exception_reasons: string[];
  operator_action: string;
};

export type AccountingBridgeReconciliationPayload = {
  summary: AccountingBridgeReconciliationSummary;
  selected_financial_year?: { id?: number; code?: string; name?: string; is_active?: boolean } | null;
  selected_accounting_period?: { id?: number; code?: string; name?: string; status?: string } | null;
  period_status?: string | null;
  available_financial_years?: Array<{ id?: number; code?: string; name?: string; is_active?: boolean }>;
  available_accounting_periods?: Array<{ id?: number; code?: string; name?: string; status?: string }>;
  readiness_blockers?: string[];
  year_end_readiness_hint?: string;
  financial_year_readiness?: AccountingBridgePeriodReadiness | null;
  accounting_period_readiness?: AccountingBridgePeriodReadiness | null;
  results: AccountingBridgeReconciliationRow[];
};

export type AccountingBridgeReconciliationFilters = {
  module?: string;
  event_key?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
  customer?: string;
  vendor?: string;
  partner?: string;
  financial_year?: string;
  accounting_period?: string;
  source_model?: string;
  source_type?: string;
  account?: string;
};

function toQuery(filters?: AccountingBridgeReconciliationFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value).trim());
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function getAccountingBridgeReconciliation(filters?: AccountingBridgeReconciliationFilters): Promise<AccountingBridgeReconciliationPayload> {
  return request<AccountingBridgeReconciliationPayload>("/accounting/bridge-reconciliation/" + toQuery(filters));
}
