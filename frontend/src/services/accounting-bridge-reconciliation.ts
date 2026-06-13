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
  exception_count: number;
  rent_lease_revenue_ready_unposted_count?: number;
  rent_lease_revenue_posted_count?: number;
  rent_lease_revenue_posted_unverified_count?: number;
  rent_lease_revenue_reconciled_count?: number;
  rent_lease_revenue_blocked_count?: number;
  rent_lease_revenue_unsupported_count?: number;
  rent_lease_payment_ready_unposted_count?: number;
  rent_lease_payment_posted_unverified_count?: number;
  rent_lease_payment_reconciled_count?: number;
  rent_lease_payment_blocked_count?: number;
  rent_lease_payment_unsupported_count?: number;
  rent_lease_collection_ready_unposted_count?: number;
  rent_lease_collection_posted_count?: number;
  rent_lease_collection_posted_unverified_count?: number;
  rent_lease_collection_reconciled_count?: number;
  rent_lease_collection_blocked_count?: number;
  rent_lease_collection_unsupported_count?: number;
  security_deposit_receipt_ready_unposted_count?: number;
  security_deposit_receipt_posted_count?: number;
  security_deposit_receipt_posted_unverified_count?: number;
  security_deposit_receipt_reconciled_count?: number;
  security_deposit_receipt_blocked_count?: number;
  security_deposit_receipt_unsupported_count?: number;
  security_deposit_refund_ready_unposted_count?: number;
  security_deposit_refund_posted_count?: number;
  security_deposit_refund_posted_unverified_count?: number;
  security_deposit_refund_reconciled_count?: number;
  security_deposit_refund_blocked_count?: number;
  security_deposit_refund_unsupported_count?: number;
  [key: string]: number | string | boolean | null | undefined | Record<string, unknown> | Array<unknown>;
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

export type AccountingBridgeReconciliationItem = { id: number; status: string; severity: string; exception_code?: string; exception_message?: string };
export type AccountingBridgePeriodReadiness = { financial_year_ready?: boolean; accounting_period_ready?: boolean; journal_numbering_ready?: boolean; posting_controls_ready?: boolean; active_financial_year?: { id?: number; code?: string; name?: string } | null; current_period?: { id?: number; code?: string; name?: string; status?: string } | null; blockers?: string[] };

export type BridgeSourceModel = "Payment" | "ReceiptDocument" | "BillingInvoice" | "RentLeaseBillingDemand" | "RentLeaseCollection" | "RentLeaseDepositTransaction" | "BillingCreditNote" | "DirectSaleReturn" | "BillingDebitNote" | "PurchaseBill" | "VendorPayment" | "StockLedger" | "Commission" | "CommissionPayoutBatch" | "SalarySheet" | "SalaryPayment" | string;
export type BridgeActionLink = { key: string; label: string; href: string; reason?: string | null; disabled?: boolean };
export type BridgePostingLine = { chart_account?: { id?: number; code?: string; name?: string } | null; description?: string; debit_amount: string; credit_amount: string };
export type BridgeFinanceAccount = { id?: number; name?: string; kind?: string; is_active?: boolean; chart_account?: { id?: number; code?: string; name?: string } | null };

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
  source_reference?: string | null;
  source_date?: string | null;
  source_status?: string | null;
  amount?: string | null;
  customer_name?: string | null;
  subscription_id?: number | string | null;
  contract_reference?: string | null;
  payment_method?: string | null;
  payment_date?: string | null;
  finance_account_name?: string | null;
  finance_account_active?: boolean | null;
  finance_account?: BridgeFinanceAccount | null;
  collection_id?: number | string | null;
  collection_number?: string | null;
  collection_reference?: string | null;
  external_reference_no?: string | null;
  rent_lease_collection_id?: number | string | null;
  rent_lease_collection_reference?: string | null;
  rent_lease_demand_id?: number | string | null;
  rent_lease_reference?: string | null;
  demand_reference?: string | null;
  demand_type?: string | null;
  demand_status?: string | null;
  plan_type?: "RENT" | "LEASE" | string | null;
  collection_status?: string | null;
  deposit_transaction_id?: number | string | null;
  deposit_transaction_number?: string | null;
  deposit_reference?: string | null;
  transaction_type?: string | null;
  transaction_status?: string | null;
  transaction_date?: string | null;
  billing_period?: string | null;
  billing_month?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  due_date?: string | null;
  collected_amount?: string | null;
  outstanding_amount?: string | null;
  reconciliation_state?: "POSTED_UNVERIFIED" | "RECONCILED" | string | null;
  posted_unverified?: boolean;
  debit_account_preview?: BridgePostingLine[];
  credit_account_preview?: BridgePostingLine[];
  canonical_status?: string;
  supported?: boolean;
  status: string;
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
  unsafe_abstract_posting_blocked?: boolean;
  action_links?: BridgeActionLink[];
  [key: string]: unknown;
};

export type BridgeCandidate = AccountingBridgeReconciliationRow & { row_type: "bridge_candidate"; bridge_candidate_id: string; idempotency_key: string };
export type BridgePostingPreview = { candidate: AccountingBridgeReconciliationRow; candidate_id: string; source: Record<string, unknown> & { model: BridgeSourceModel; pk: number | string; display: string; reference_number?: string | null; date: string | null; amount: string }; collection_identity?: Record<string, unknown>; journal_date: string | null; accounting_period?: AccountingBridgeReconciliationRow["accounting_period"]; journal_number_preview?: string | null; debit_lines: BridgePostingLine[]; credit_lines: BridgePostingLine[]; lines: BridgePostingLine[]; total_debit: string; total_credit: string; is_balanced: boolean; tax_lines?: BridgePostingLine[]; finance_account_line?: BridgeFinanceAccount | null; warnings: string[]; blockers: string[]; can_post: boolean; idempotency_key: string; safety_text: string };
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
