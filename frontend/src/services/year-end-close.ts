import { apiFetch } from "@/lib/api";

export type YearEndIssue = {
  code: string;
  message: string;
  blocker_code?: string;
  blocker_label?: string;
  blocker_count?: number;
  recommended_action?: string;
  action_href?: string | null;
  is_acknowledgeable?: boolean;
};

export type YearEndFinancialYear = {
  id: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  is_active: boolean;
  closed: boolean;
};

export type YearEndPeriodRow = {
  id: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  journal_count: number;
  journal_debit_total: string;
  journal_credit_total: string;
  invoice_count: number;
  invoice_total: string;
  receipt_count: number;
  receipt_total: string;
};

export type YearEndReadiness = {
  financial_year: YearEndFinancialYear | null;
  periods: YearEndPeriodRow[];
  open_periods?: YearEndPeriodRow[];
  period_summary: { total_periods?: number; expected_periods?: number };
  open_period_count: number;
  locked_period_count: number;
  closed_period_count: number;
  missing_period_count: number;
  gap_or_overlap_count: number;
  unposted_bridge_item_count: number;
  blocked_bridge_item_count: number;
  blocked_mapping_count: number;
  blocked_period_count: number;
  blocked_numbering_count: number;
  blocked_approval_count: number;
  unsupported_source_count: number;
  staff_advance_boundary?: number;
  bridge_event_counts?: Record<string, Record<string, number>>;
  blocking_bridge_groups?: Array<{
    event_key: string;
    blocker_code: string;
    blocker_label?: string | null;
    count: number;
    recommended_action?: string | null;
    action_href?: string | null;
    is_acknowledgeable?: boolean;
    is_postable?: boolean;
  }>;
  unreconciled_item_count: number;
  unreconciled_exception_count: number;
  exception_count: number;
  reconciliation_error_count: number;
  missing_numbering_profile_count: number;
  blocking_items: YearEndIssue[];
  warning_items: YearEndIssue[];
  warning_count: number;
  ready_to_close: boolean;
  requires_acknowledgement: boolean;
  allowed_actions: string[];
  action_links?: {
    bridge_reconciliation?: string;
    mapping_audit?: string;
    reconciliation_runs?: string;
    accounting_periods?: string;
    document_numbering?: string;
    finance_account_setup?: string;
  };
  confirmation_text_required: string | null;
  historical_document_numbers_preserved: boolean;
  read_only_contract?: {
    readiness_creates_journals: boolean;
    readiness_allocates_document_numbers: boolean;
    close_auto_posts_bridge_items: boolean;
    close_creates_adjustment_journals: boolean;
    close_renumbers_historical_documents: boolean;
  };
};

export type YearEndCloseResult = {
  updated: boolean;
  already_closed: boolean;
  closed_period_count?: number;
  readiness: YearEndReadiness;
};

function query(financialYear?: string | number | null): string {
  if (financialYear === undefined || financialYear === null || String(financialYear).trim() === "") return "";
  const params = new URLSearchParams({ financial_year: String(financialYear).trim() });
  return `?${params.toString()}`;
}

export function getYearEndReadiness(financialYear?: string | number | null) {
  return apiFetch<YearEndReadiness>(`/admin/accounting/year-end/readiness/${query(financialYear)}`);
}

export function runYearEndClose(payload: {
  financial_year?: string | number | null;
  confirmation_text: string;
  acknowledge_warnings?: boolean;
}) {
  return apiFetch<YearEndCloseResult>("/admin/accounting/year-end/close/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
