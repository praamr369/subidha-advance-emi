import { request } from "@/services/api";

export type AccountingBridgeReconciliationSummary = {
  source_count?: number;
  ready_count?: number;
  postable_count?: number;
  ready_unposted_count?: number;
  posted_count?: number;
  settled_count?: number;
  reconciled_count?: number;
  blocked_count?: number;
  exception_count?: number;
  unsupported_count?: number;
  blocked_by_mapping_count?: number;
  blocked_by_finance_account_count?: number;
  blocked_by_period_count?: number;
  blocked_by_numbering_count?: number;
  blocked_by_approval_count?: number;
  unposted_bridge_item_count?: number;
  posted_unverified_count?: number;
  reconciliation_exception_count?: number;
  ready_unposted_by_event?: Record<string, number>;
  blocked_by_mapping_by_event?: Record<string, number>;
  status_counts_by_event?: Record<string, Record<string, number>>;
  blocking_groups?: Array<Record<string, unknown>>;
  [key: string]: unknown;
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
  severity?: string;
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
  [key: string]: unknown;
};

export type BridgeSourceModel =
  | "Payment"
  | "ReceiptDocument"
  | "BillingInvoice"
  | "RentLeaseBillingDemand"
  | "RentLeaseCollection"
  | "RentLeaseDepositTransaction"
  | "CustomerAdvance"
  | "CustomerAdvanceAllocation"
  | "CustomerAdvanceRefund"
  | "BillingCreditNote"
  | "DirectSaleReturn"
  | "BillingDebitNote"
  | "PurchaseBill"
  | "VendorPayment"
  | "StockLedger"
  | "Commission"
  | "CommissionPayoutBatch"
  | "SalarySheet"
  | "SalaryPayment"
  | string;

export type BridgeActionLink = {
  key?: string;
  type?: string;
  label: string;
  href?: string | null;
  reason?: string | null;
  disabled?: boolean;
};

export type PhaseFSourceInventoryItem = {
  phase: string;
  domain: string;
  source_model: BridgeSourceModel;
  event_key?: string | null;
  event_keys: string[];
  accounting_shape: string;
  source_owner: string;
  status: string;
  counts: Record<string, number | undefined>;
  primary_blocker_type?: string | null;
  can_post?: boolean;
  action_links?: BridgeActionLink[];
};

export type PhaseFControlTower = {
  source_inventory?: PhaseFSourceInventoryItem[];
  groups?: Record<string, Record<string, number>>;
  phase_counts?: Record<string, Record<string, number>>;
  readiness?: Record<string, unknown>;
  guardrails?: Record<string, boolean>;
};

export type ProductionAccountingValidationWorkflow = {
  domain: string;
  workflow: string;
  source_model: BridgeSourceModel;
  event_key: string;
  accounting_shape: string;
  operator: string;
  bridge_source_ownership: string;
  expected_candidate_status: string;
  expected_action_link?: string;
  expected_action?: BridgeActionLink;
  expected_no_mutation_rule?: string;
  expected_reconciliation_posture: string;
  validation_test_name?: string;
  status: string;
  current_row_count?: number;
  posted_unverified_count?: number;
  reconciled_count?: number;
  can_post?: boolean;
  read_only?: boolean;
};

export type ProductionAccountingValidation = {
  title?: string;
  safety_copy?: string;
  read_only?: boolean;
  creates_journal_entry?: boolean;
  creates_accounting_bridge_posting?: boolean;
  auto_posts?: boolean;
  auto_reconciles?: boolean;
  auto_closes_period?: boolean;
  mutates_sources?: boolean;
  workflow_count?: number;
  groups?: Record<string, ProductionAccountingValidationWorkflow[]>;
  workflows?: ProductionAccountingValidationWorkflow[];
  source_event_separation_checks?: Record<string, boolean>;
};

export type BridgePostingLine = {
  chart_account?: { id?: number; code?: string; name?: string } | null;
  description?: string;
  debit_amount: string;
  credit_amount: string;
};

export type BridgeFinanceAccount = {
  id?: number;
  name?: string;
  kind?: string;
  is_active?: boolean;
  chart_account?: { id?: number; code?: string; name?: string } | null;
};

export type AccountingBridgeReconciliationRow = {
  id?: string | number;
  row_type?: string;
  bridge_candidate_id?: string | number | null;
  idempotency_key?: string | null;
  event_key?: string;
  event_label?: string;
  label?: string;
  module?: string;
  source_module?: string;
  event_group?: string;
  source_model?: BridgeSourceModel | null;
  source_type?: string | null;
  source_pk?: number | string | null;
  source_id?: string | number | null;
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
  method?: string | null;
  payment_date?: string | null;
  finance_account_name?: string | null;
  finance_account_active?: boolean | null;
  finance_account?: BridgeFinanceAccount | null;
  journal_entry?: AccountingBridgeReconciliationJournal | null;
  reconciliation_items?: AccountingBridgeReconciliationItem[];
  reconciliation_state?: string | null;
  posted_unverified?: boolean;
  can_preview?: boolean;
  can_post?: boolean;
  can_reconcile?: boolean;
  is_postable?: boolean;
  is_acknowledgeable?: boolean;
  supported?: boolean;
  status?: string;
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
  action_links?: BridgeActionLink[];
  exception_reasons?: string[];
  operator_action?: string;
  refund_reference?: string | null;
  refund_reference_no?: string | null;
  refund_date?: string | null;
  allocation_reference?: string | null;
  allocation_date?: string | null;
  advance_reference?: string | null;
  reference_no?: string | null;
  collection_number?: string | null;
  collection_reference?: string | null;
  deposit_transaction_number?: string | null;
  deposit_reference?: string | null;
  transaction_date?: string | null;
  [key: string]: unknown;
};

export type BridgeCandidate = AccountingBridgeReconciliationRow & {
  row_type: "bridge_candidate";
  bridge_candidate_id: string;
  idempotency_key: string;
};

export type BridgePostingPreview = {
  candidate: AccountingBridgeReconciliationRow;
  candidate_id: string;
  source: Record<string, unknown> & { model: BridgeSourceModel; pk: number | string; display: string; reference_number?: string | null; date: string | null; amount: string };
  journal_date: string | null;
  accounting_period?: AccountingBridgeReconciliationRow["accounting_period"];
  journal_number_preview?: string | null;
  debit_lines: BridgePostingLine[];
  credit_lines: BridgePostingLine[];
  lines: BridgePostingLine[];
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
  tax_lines?: BridgePostingLine[];
  finance_account_line?: BridgeFinanceAccount | null;
  warnings: string[];
  blockers: string[];
  can_post: boolean;
  idempotency_key: string;
  safety_text: string;
};

export type BridgePostResult = {
  posted: boolean;
  already_posted: boolean;
  journal_entry?: AccountingBridgeReconciliationJournal | null;
  reconciliation_item?: { id: number; status: string; exception_code?: string } | null;
  next_action?: string;
};

export type BridgeBatchPreviewResult = {
  selected_count: number;
  previewable_count?: number;
  postable_count: number;
  blocked_count: number;
  total_debit: string;
  total_credit: string;
  previews: BridgePostingPreview[];
  blockers: Record<string, string[]>;
};

export type BridgeBatchPostResult = {
  selected_count?: number;
  posted_count: number;
  already_posted_count?: number;
  skipped_already_posted_count: number;
  blocked_count: number;
  created_journal_ids: number[];
  reconciliation_pending_count: number;
  posted: BridgePostResult[];
  already_posted: BridgePostResult[];
  errors: Record<string, string[]>;
};

export type ReconciliationVerificationResult = { id: number; status: string; verified: boolean; verified_at?: string; detail?: string };

export type AccountingBridgeReconciliationFilters = {
  financial_year?: string;
  accounting_period?: string;
  status?: string;
  event_key?: string;
  module?: string;
  source_model?: string;
  vendor?: string;
  customer?: string;
  page?: number | string;
  page_size?: number | string;
};

export type AccountingBridgeReconciliationPayload = {
  summary: AccountingBridgeReconciliationSummary;
  period_readiness?: AccountingBridgePeriodReadiness;
  financial_year_readiness?: AccountingBridgePeriodReadiness;
  accounting_period_readiness?: AccountingBridgePeriodReadiness;
  phase_f_control_tower?: PhaseFControlTower;
  production_accounting_validation?: ProductionAccountingValidation;
  results: AccountingBridgeReconciliationRow[];
  pagination?: { count: number; page: number; page_size: number; total_pages: number };
  readiness_blockers?: string[];
  selected_financial_year?: Record<string, unknown> | null;
  selected_accounting_period?: Record<string, unknown> | null;
  available_financial_years?: Array<Record<string, unknown>>;
  available_accounting_periods?: Array<Record<string, unknown>>;
};

export function isConcreteCandidate(row: AccountingBridgeReconciliationRow): boolean {
  return row.row_type === "bridge_candidate" && Boolean(row.bridge_candidate_id);
}

export function isUnsupportedOrDeferredRow(row: AccountingBridgeReconciliationRow): boolean {
  const status = String(row.status || "").toUpperCase();
  return ["UNSUPPORTED_SOURCE", "UNSUPPORTED", "DEFERRED", "SKIPPED_NOT_APPLICABLE"].includes(status);
}

export function isBlockedOrExceptionRow(row: AccountingBridgeReconciliationRow): boolean {
  const status = String(row.status || "").toUpperCase();
  return (
    status === "EXCEPTION" ||
    status.startsWith("BLOCKED") ||
    (Boolean(row.exception_reasons?.length) &&
      !["READY_UNPOSTED", "POSTED_UNVERIFIED", "RECONCILED"].includes(status) &&
      !isUnsupportedOrDeferredRow(row))
  );
}

export function isConcreteSourceCandidate(row: AccountingBridgeReconciliationRow): boolean {
  return isConcreteCandidate(row) && !isBlockedOrExceptionRow(row) && !isUnsupportedOrDeferredRow(row);
}

export function getAccountingBridgeReconciliation(filters: AccountingBridgeReconciliationFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, String(value));
  });
  const query = params.toString();
  return request<AccountingBridgeReconciliationPayload>(`/admin/accounting/bridge-reconciliation/${query ? `?${query}` : ""}`);
}

export function previewBridgeCandidate(candidateId: string) {
  return request<BridgePostingPreview>(`/admin/accounting/bridge-reconciliation/candidates/${encodeURIComponent(candidateId)}/preview/`);
}

export async function postBridgeCandidate(candidateId: string, payload: { idempotency_key?: string; confirm: boolean; posting_note?: string }) {
  const preview = await previewBridgeCandidate(candidateId);
  if (!preview.can_post || !preview.idempotency_key) {
    throw new Error(preview.blockers?.join("; ") || "Bridge candidate preview is not postable.");
  }
  return request<BridgePostResult>(`/admin/accounting/bridge-reconciliation/candidates/${encodeURIComponent(candidateId)}/post/`, {
    method: "POST",
    body: JSON.stringify({ ...payload, idempotency_key: preview.idempotency_key }),
  });
}

export function previewBridgeCandidateBatch(candidateIds: string[]) {
  return request<BridgeBatchPreviewResult>("/admin/accounting/bridge-reconciliation/batch-preview/", {
    method: "POST",
    body: JSON.stringify({ candidate_ids: candidateIds }),
  });
}

export async function postBridgeCandidateBatch(payload: { candidate_ids: string[]; idempotency_keys?: Record<string, string>; confirm: boolean; posting_note?: string }) {
  const preview = await previewBridgeCandidateBatch(payload.candidate_ids);
  const idempotencyKeys = Object.fromEntries(
    preview.previews
      .filter((item) => item.can_post && item.idempotency_key)
      .map((item) => [item.candidate_id, item.idempotency_key])
  );
  if (Object.keys(idempotencyKeys).length !== payload.candidate_ids.length) {
    throw new Error("One or more selected bridge candidates are not postable after preview.");
  }
  return request<BridgeBatchPostResult>("/admin/accounting/bridge-reconciliation/batch-post/", {
    method: "POST",
    body: JSON.stringify({ ...payload, idempotency_keys: idempotencyKeys }),
  });
}

export function verifyBridgeReconciliationItem(itemId: number, payload: { note?: string; run_id?: number | null }) {
  return request<ReconciliationVerificationResult>(`/admin/accounting/bridge-reconciliation/items/${itemId}/verify/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
