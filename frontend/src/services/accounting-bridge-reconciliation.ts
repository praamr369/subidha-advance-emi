import { request } from "@/services/api";

export type AccountingBridgeReconciliationSummary = {
  source_count: number;
  ready_unposted_count: number;
  blocked_count: number;
  posted_count: number;
  settled_count: number;
  reconciled_count: number;
  exception_count: number;
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
  active_financial_year?: { code?: string; name?: string } | null;
  current_period?: { code?: string; name?: string; status?: string } | null;
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
  journal_entry?: AccountingBridgeReconciliationJournal | null;
  settlement_linked: boolean;
  reconciliation_linked: boolean;
  reconciliation_items: AccountingBridgeReconciliationItem[];
  exception_reasons: string[];
  operator_action: string;
};

export type AccountingBridgeReconciliationPayload = {
  summary: AccountingBridgeReconciliationSummary;
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

export async function getAccountingBridgeReconciliation(
  filters?: AccountingBridgeReconciliationFilters,
): Promise<AccountingBridgeReconciliationPayload> {
  return request<AccountingBridgeReconciliationPayload>(`/admin/accounting/bridge-reconciliation/${toQuery(filters)}`);
}
