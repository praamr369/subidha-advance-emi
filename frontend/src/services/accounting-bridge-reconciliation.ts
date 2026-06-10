import { request } from "@/services/api";

export type AccountingBridgeReconciliationSummary = {
  source_count: number;
  ready_count?: number;
  postable_count?: number;
  ready_unposted_count: number;
  posted_count: number;
  settled_count: number;
  reconciled_count: number;
  blocked_count: number;
  blocked_by_mapping_count?: number;
  blocked_by_period_count?: number;
  blocked_by_numbering_count?: number;
  blocked_by_approval_count?: number;
  unsupported_count?: number;
  unsupported_source_count?: number;
  exception_count: number;
  total_invoices?: number;
  total_receipts?: number;
  total_journal_postings?: number;
  total_money_movements?: number;
  unposted_bridge_item_count?: number;
  posted_unreconciled_count?: number;
  posted_unverified_count?: number;
  unreconciled_money_movement_count?: number;
  reconciliation_exception_count?: number;
  blocked_bridge_item_count?: number;
  locked_period_count?: number;
  closed_period_count?: number;
  ready_unposted_by_event?: Record<string, number>;
  blocked_by_mapping_by_event?: Record<string, number>;
  status_counts_by_event?: Record<string, Record<string, number>>;
  receipt_ready_unposted_count?: number;
  receipt_posted_count?: number;
  receipt_posted_unverified_count?: number;
  receipt_reconciled_count?: number;
  billing_invoice_ready_unposted_count?: number;
  billing_invoice_posted_count?: number;
  billing_invoice_posted_unverified_count?: number;
  billing_invoice_reconciled_count?: number;
  billing_invoice_blocked_count?: number;
  billing_invoice_unsupported_count?: number;
  credit_return_ready_unposted_count?: number;
  credit_return_posted_count?: number;
  credit_return_posted_unverified_count?: number;
  credit_return_reconciled_count?: number;
  credit_return_blocked_count?: number;
  credit_return_unsupported_count?: number;
  debit_note_ready_unposted_count?: number;
  debit_note_posted_count?: number;
  debit_note_posted_unverified_count?: number;
  debit_note_reconciled_count?: number;
  debit_note_blocked_count?: number;
  debit_note_unsupported_count?: number;
  payment_ready_unposted_count?: number;
  payment_posted_count?: number;
  payment_posted_unverified_count?: number;
  payment_reconciled_count?: number;
  blocking_groups?: Array<{ event_key: string; blocker_code: string; blocker_label?: string | null; count: number; recommended_action?: string | null; action_href?: string | null; is_acknowledgeable?: boolean; is_postable?: boolean }>;
};

export type AccountingBridgeReconciliationJournal = { id?: number | null; entry_no?: string | null; entry_date?: string | null; status?: string | null; financial_year?: number | null; financial_year_code?: string | null; accounting_period?: number | null; accounting_period_code?: string | null; accounting_period_name?: string | null; accounting_period_status?: string | null };
export type AccountingBridgeReconciliationItem = { id: number; status: string; severity: string; exception_code?: string; exception_message?: string };
export type AccountingBridgePeriodReadiness = { financial_year_ready?: boolean; accounting_period_ready?: boolean; journal_numbering_ready?: boolean; posting_controls_ready?: boolean; active_financial_year?: { id?: number; code?: string; name?: string } | null; current_period?: { id?: number; code?: string; name?: string; status?: string } | null; blockers?: string[] };
export type BridgeSourceModel = "Payment" | "ReceiptDocument" | "BillingInvoice" | "BillingCreditNote" | "DirectSaleReturn" | "BillingDebitNote" | string;

export type AccountingBridgeReconciliationRow = {
  id?: string;
  bridge_candidate_id?: string;
  row_type: string;
  event_key: string;
  event_label?: string;
  label: string;
  module: string;
  source_module?: string;
  event_group?: string;
  source_model?: BridgeSourceModel | null;
  source_type?: string | null;
  source_pk?: number | string | null;
  source_id?: string | null;
  source_display?: string | null;
  source_reference_number?: string | null;
  source_date?: string | null;
  source_status?: string | null;
  amount?: string | null;
  receipt_type?: string | null;
  receipt_status?: string | null;
  invoice_number?: string | null;
  invoice_type?: string | null;
  invoice_status?: string | null;
  credit_note_number?: string | null;
  credit_note_status?: string | null;
  debit_note_number?: string | null;
  debit_note_status?: string | null;
  return_number?: string | null;
  return_status?: string | null;
  taxable_amount?: string | null;
  tax_amount?: string | null;
  reconciliation_state?: "POSTED_UNVERIFIED" | "RECONCILED" | string | null;
  posted_unverified?: boolean;
  debit_account_preview?: BridgePostingLine[];
  credit_account_preview?: BridgePostingLine[];
  finance_account?: BridgeFinanceAccount | null;
  canonical_status?: string;
  source_reference?: string | null;
  supported?: boolean;
  status: string;
  mapping_status?: string;
  posting_mode?: string;
  can_preview?: boolean;
  can_post: boolean;
  can_reconcile?: boolean;
  is_postable?: boolean;
  is_acknowledgeable?: boolean;
  blocker_code?: string | null;
  blocker_label?: string | null;
  blocker_count?: number;
  blocker_reason?: string | null;
  recommended_action?: string | null;
  action_href?: string | null;
  setup_href?: string | null;
  preview_action_href?: string | null;
  post_action_href?: string | null;
  source_action_href?: string | null;
  financial_year_id?: number | null;
  accounting_period_id?: number | null;
  financial_year?: { id?: number; code?: string; name?: string; is_active?: boolean } | null;
  accounting_period?: { id?: number; code?: string; name?: string; status?: string } | null;
  period_status?: string | null;
  period_blocker_code?: string | null;
  period_blocker_reason?: string | null;
  journal_entry?: AccountingBridgeReconciliationJournal | null;
  settlement_linked: boolean;
  reconciliation_linked: boolean;
  reconciliation_items: AccountingBridgeReconciliationItem[];
  existing_journal_entry_id?: number | null;
  existing_accounting_bridge_posting_id?: number | null;
  existing_money_movement_id?: number | null;
  existing_reconciliation_item_id?: number | null;
  idempotency_key?: string | null;
  exception_reasons: string[];
  operator_action: string;
  source_item_action?: string;
  unsafe_abstract_posting_blocked?: boolean;
};

export type BridgePostingLine = { chart_account?: { id?: number; code?: string; name?: string } | null; description?: string; debit_amount: string; credit_amount: string };
export type BridgeFinanceAccount = { id?: number; name?: string; kind?: string; chart_account?: { id?: number; code?: string; name?: string } | null };
export type BridgeCandidate = AccountingBridgeReconciliationRow & { row_type: "bridge_candidate"; bridge_candidate_id: string; idempotency_key: string };
export type BridgePostingPreview = { candidate: AccountingBridgeReconciliationRow; candidate_id: string; source: { model: BridgeSourceModel; pk: number | string; display: string; reference_number?: string | null; date: string | null; amount: string; source_status?: string | null; source_type?: string | null; invoice_number?: string | null; invoice_type?: string | null; invoice_status?: string | null; debit_note_number?: string | null; debit_note_status?: string | null; taxable_amount?: string | null; tax_amount?: string | null }; journal_date: string | null; accounting_period?: AccountingBridgeReconciliationRow["accounting_period"]; journal_number_preview?: string | null; debit_lines: BridgePostingLine[]; credit_lines: BridgePostingLine[]; lines: BridgePostingLine[]; total_debit: string; total_credit: string; is_balanced: boolean; tax_lines?: BridgePostingLine[]; finance_account_line?: BridgeFinanceAccount | null; warnings: string[]; blockers: string[]; can_post: boolean; idempotency_key: string; safety_text: string };
export type BridgePostResult = { posted: boolean; already_posted: boolean; journal_entry?: AccountingBridgeReconciliationJournal | null; reconciliation_item?: { id: number; status: string; exception_code?: string } | null; next_action?: string };
export type BridgeBatchPreviewResult = { selected_count: number; previewable_count?: number; postable_count: number; blocked_count: number; total_debit: string; total_credit: string; previews: BridgePostingPreview[]; blockers: Record<string, string[]> };
export type BridgeBatchPostResult = { selected_count?: number; posted_count: number; already_posted_count?: number; skipped_already_posted_count: number; blocked_count: number; created_journal_ids: number[]; reconciliation_pending_count: number; posted: BridgePostResult[]; already_posted: BridgePostResult[]; errors: Record<string, string[]> };
export type ReconciliationVerificationResult = { id: number; status: string; verified: boolean; verified_at?: string; detail?: string };

export type AccountingBridgeReconciliationPayload = {
  summary: AccountingBridgeReconciliationSummary;
  canonical_statuses?: string[];
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

export type AccountingBridgeReconciliationFilters = { module?: string; event_key?: string; date_from?: string; date_to?: string; status?: string; customer?: string; vendor?: string; partner?: string; financial_year?: string; accounting_period?: string; source_model?: string; source_type?: string; account?: string };

function toQuery(filters?: AccountingBridgeReconciliationFilters): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters ?? {})) if (value !== undefined && value !== null && String(value).trim() !== "") search.set(key, String(value));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function getAccountingBridgeReconciliation(filters?: AccountingBridgeReconciliationFilters) {
  return request<AccountingBridgeReconciliationPayload>(`/admin/accounting/bridge-reconciliation/${toQuery(filters)}`);
}

export function previewBridgeCandidate(candidateId: string) {
  return request<BridgePostingPreview>(`/admin/accounting/bridge-reconciliation/candidates/${encodeURIComponent(candidateId)}/preview/`);
}

export function postBridgeCandidate(candidateId: string, payload: { idempotency_key: string; confirm?: boolean; confirm_text?: string; posting_note?: string }) {
  return request<BridgePostResult>(`/admin/accounting/bridge-reconciliation/candidates/${encodeURIComponent(candidateId)}/post/`, { method: "POST", body: JSON.stringify(payload) });
}

export function previewBridgeCandidateBatch(candidate_ids: string[]) {
  return request<BridgeBatchPreviewResult>("/admin/accounting/bridge-reconciliation/batch-preview/", { method: "POST", body: JSON.stringify({ candidate_ids }) });
}

export function postBridgeCandidateBatch(payload: { candidate_ids: string[]; idempotency_keys: Record<string, string>; confirm?: boolean; confirm_text?: string; posting_note?: string }) {
  return request<BridgeBatchPostResult>("/admin/accounting/bridge-reconciliation/batch-post/", { method: "POST", body: JSON.stringify(payload) });
}

export const batchPreviewBridgeCandidates = previewBridgeCandidateBatch;
export const batchPostBridgeCandidates = postBridgeCandidateBatch;

export function verifyBridgeReconciliationItem(itemId: number, payload: { note?: string; run_id?: number | null }) {
  return request<ReconciliationVerificationResult>(`/admin/accounting/bridge-reconciliation/items/${itemId}/verify/`, { method: "POST", body: JSON.stringify(payload) });
}
