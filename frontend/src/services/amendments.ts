import { apiFetch } from "@/lib/api";
import type {
  ContractRecontractEvent,
  ContractRecontractExecutionFields,
  ContractRecontractFinancialImpactPreview,
  ContractRecontractScheduleLine,
  ProductRecontractProgress,
} from "@/services/amendmentPreviews";

export type AmendmentContractType = "EMI_SUBSCRIPTION" | "RENT_LEASE";
export type AmendmentStatus = "REQUESTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "IMPLEMENTED" | "CANCELLED" | "APPLIED";
export type AmendmentRequesterRole = "CUSTOMER" | "PARTNER";
export type AmendmentType =
  | "ADDRESS_CHANGE"
  | "CONTACT_CORRECTION"
  | "LEGAL_DOCUMENT_CORRECTION"
  | "TENURE_EXTENSION"
  | "SCHEDULE_CORRECTION"
  | "PRODUCT_CHANGE"
  | "LUCKY_ID_CHANGE"
  | "BATCH_CHANGE"
  | "DEPOSIT_ADJUSTMENT"
  | "EMI_AMOUNT_CHANGE"
  | "CONTRACT_PRICE_CHANGE"
  | "RENT_AMOUNT_CHANGE"
  | "LEASE_TERM_CHANGE"
  | "OTHER"
  | "PRODUCT_UPGRADE";

export type ProductRecontractConsentStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type ProductRecontractAdminApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AmendmentWorkflowCapability = {
  category: "NON_FINANCIAL" | "SAME_PRICE_PRODUCT_REFERENCE" | "PRODUCT_RECONTRACT" | "LUCKY_ID_BATCH_PREVIEW" | "RENT_LEASE_PREVIEW" | "DEPOSIT_SECURITY_PREVIEW" | "BLOCKED";
  can_review: boolean;
  can_approve_decision: boolean;
  can_reject_decision: boolean;
  can_execute_directly: boolean;
  requires_preview?: boolean;
  requires_recontract_workflow: boolean;
  requires_customer_consent: boolean;
  requires_accounting_bridge: boolean;
  requires_reconciliation_bridge: boolean;
  blocked_reason: string;
};

export type ProductRecontractPreviewSummary = ContractRecontractExecutionFields & {
  id: number;
  status: string;
  impact_type: string;
  old_product_id?: number | null;
  old_product_name?: string | null;
  old_product_code?: string | null;
  new_product_id?: number | null;
  new_product_name?: string | null;
  new_product_code?: string | null;
  old_contract_total?: string;
  new_contract_total?: string;
  price_difference?: string;
  amount_already_paid?: string;
  old_remaining_balance?: string;
  new_remaining_balance?: string;
  proposed_new_remaining_balance?: string;
  current_tenure_months?: number;
  preview_tenure_months?: number;
  current_monthly_amount?: string;
  proposed_monthly_amount?: string;
  pending_emi_count?: number;
  effective_date_preview?: string | null;
  warnings?: string[];
  customer_consent_status?: ProductRecontractConsentStatus;
  customer_consented_at?: string | null;
  customer_consent_note?: string | null;
  admin_approval_status?: ProductRecontractAdminApprovalStatus;
  admin_approved_by?: number | null;
  admin_approved_at?: string | null;
  admin_approval_note?: string | null;
  admin_approval_snapshot?: Record<string, unknown>;
  source_record_mutation?: boolean;
  schedule_preview_lines?: ContractRecontractScheduleLine[];
  latest_financial_impact_preview?: ContractRecontractFinancialImpactPreview | null;
  executed?: boolean;
  executed_at?: string | null;
  execution_status?: string | null;
  accounting_bridge_posting_id?: number | null;
  journal_entry_id?: number | null;
  reconciliation_item_id?: number | null;
  reconciliation_run_id?: number | null;
  reconciliation_evidence_ids?: number[];
  workflow_flags?: Record<string, boolean>;
  progress?: ProductRecontractProgress;
};

export type LuckyBatchPreview = {
  current_subscription_id: number;
  current_contract_reference?: string | null;
  current_batch_id?: number | null;
  current_batch_code?: string | null;
  current_lucky_id?: number | null;
  current_lucky_number?: number | null;
  requested_batch_id?: number | null;
  requested_batch_code?: string | null;
  requested_lucky_id?: number | null;
  requested_lucky_number?: number | null;
  availability_status: string;
  ownership_conflict_status: string;
  draw_status_risk: string;
  waiver_winner_risk: string;
  lifecycle_blocker_reason: string;
  execution_supported: boolean;
};

export type DepositSecurityPreview = {
  amendment_id: number;
  amendment_type: AmendmentType;
  amendment_status: AmendmentStatus;
  current_contract_id: number;
  current_contract_reference?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  current_deposit_amount: string;
  requested_deposit_amount?: string | null;
  current_deposit_status: string;
  deposit_received_amount: string;
  deposit_refunded_amount: string;
  deposit_deducted_amount: string;
  liability_impact_category: string;
  refund_deduction_risk: string;
  accounting_impact_category: string;
  reconciliation_impact_category: string;
  possession_handover_risk: string;
  execution_supported: boolean;
  blocker_reasons: string[];
};

export const AMENDMENT_STATUSES: AmendmentStatus[] = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];
export const AMENDMENT_TYPES: Array<{ value: AmendmentType; label: string }> = [
  { value: "ADDRESS_CHANGE", label: "Address change" },
  { value: "CONTACT_CORRECTION", label: "Contact correction" },
  { value: "LEGAL_DOCUMENT_CORRECTION", label: "Legal document correction" },
  { value: "SCHEDULE_CORRECTION", label: "Schedule correction" },
  { value: "TENURE_EXTENSION", label: "Tenure extension" },
  { value: "PRODUCT_CHANGE", label: "Product change" },
  { value: "LUCKY_ID_CHANGE", label: "Lucky ID change" },
  { value: "BATCH_CHANGE", label: "Batch change" },
  { value: "DEPOSIT_ADJUSTMENT", label: "Deposit adjustment" },
  { value: "EMI_AMOUNT_CHANGE", label: "EMI amount change" },
  { value: "CONTRACT_PRICE_CHANGE", label: "Contract price change" },
  { value: "RENT_AMOUNT_CHANGE", label: "Rent amount change" },
  { value: "LEASE_TERM_CHANGE", label: "Lease term change" },
  { value: "OTHER", label: "Other" },
];

export type AmendmentRecord = {
  id: number;
  amendment_no?: string | null;
  contract_type: AmendmentContractType;
  subscription?: number | null;
  subscription_number?: string | null;
  rent_lease_contract?: number | null;
  rent_lease_contract_number?: string | null;
  customer?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  partner?: number | null;
  requested_by?: number | null;
  requested_by_username?: string | null;
  requested_role: AmendmentRequesterRole;
  amendment_type: AmendmentType;
  status: AmendmentStatus;
  old_values?: Record<string, unknown>;
  requested_values?: Record<string, unknown>;
  approved_values?: Record<string, unknown>;
  implemented_values?: Record<string, unknown>;
  previous_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  reason: string;
  admin_note?: string;
  rejection_reason?: string | null;
  financial_impact_amount?: string | null;
  requires_emi_recalculation?: boolean;
  requires_inventory_review?: boolean;
  requires_lucky_id_review?: boolean;
  requires_accounting_review?: boolean;
  requires_rent_lease_review?: boolean;
  effective_date?: string | null;
  approved_by?: number | null;
  approved_by_username?: string | null;
  approved_at?: string | null;
  implemented_by?: number | null;
  implemented_by_username?: string | null;
  implemented_at?: string | null;
  is_implementable?: boolean;
  implementation_block_reason?: string;
  implementable_fields?: string[];
  latest_product_recontract_preview?: ProductRecontractPreviewSummary | null;
  workflow_capability?: AmendmentWorkflowCapability;
  applied_at?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string | null;
};

export type AmendmentCreatePayload = {
  contract_type: AmendmentContractType;
  subscription?: number | null;
  rent_lease_contract?: number | null;
  amendment_type: AmendmentType;
  requested_values?: Record<string, unknown>;
  reason: string;
  effective_date?: string | null;
  metadata?: Record<string, unknown>;
};

export type ProductRecontractReportFilters = {
  executed?: string;
  customerConsentStatus?: string;
  adminApprovalStatus?: string;
  product?: string;
  customer?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ProductRecontractEvidenceStatus = "GENERATED" | "PREVIEWED" | "POSTED" | "LINKED" | "MISSING" | "BLOCKED" | string;

export type ProductRecontractReportRow = {
  id: number;
  amendment_id: number;
  amendment_no?: string | null;
  subscription_id?: number | null;
  subscription_number?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  old_product_id?: number | null;
  old_product_name?: string | null;
  old_product_code?: string | null;
  new_product_id?: number | null;
  new_product_name?: string | null;
  new_product_code?: string | null;
  old_contract_total: string;
  new_contract_total: string;
  price_difference: string;
  customer_consent_status: ProductRecontractConsentStatus;
  admin_approval_status: ProductRecontractAdminApprovalStatus;
  schedule_preview_status: ProductRecontractEvidenceStatus;
  financial_impact_preview_status: ProductRecontractEvidenceStatus;
  accounting_posting_status: ProductRecontractEvidenceStatus;
  reconciliation_bridge_status: ProductRecontractEvidenceStatus;
  executed: boolean;
  executed_status: "EXECUTED" | "NOT_EXECUTED" | string;
  executed_at?: string | null;
  accounting_bridge_posting_id?: number | null;
  journal_entry_id?: number | null;
  journal_entry_no?: string | null;
  reconciliation_item_id?: number | null;
  reconciliation_run_id?: number | null;
  addendum_print_eligible?: boolean;
  addendum_print_reference?: { amendment_id: number; route: string } | null;
  created_at?: string;
};

function normalizeList(payload: unknown): AmendmentRecord[] {
  if (Array.isArray(payload)) return payload as AmendmentRecord[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: AmendmentRecord[] }).results;
  }
  return [];
}

function normalizeReportRows(payload: unknown): ProductRecontractReportRow[] {
  if (Array.isArray(payload)) return payload as ProductRecontractReportRow[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: ProductRecontractReportRow[] }).results;
  }
  return [];
}

function queryString(params: Record<string, string | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCustomerAmendments(): Promise<AmendmentRecord[]> {
  return normalizeList(await apiFetch<unknown>("/customer/contract-amendments/"));
}

export async function createCustomerAmendment(payload: AmendmentCreatePayload): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>("/customer/contract-amendments/", { method: "POST", body: payload });
}

export async function getCustomerAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/customer/contract-amendments/${id}/`);
}

export async function consentProductRecontractPreview(
  amendmentId: number,
  decision: Exclude<ProductRecontractConsentStatus, "PENDING">,
  note = "",
): Promise<ContractRecontractEvent> {
  return apiFetch<ContractRecontractEvent>(`/customer/contract-amendments/${amendmentId}/product-recontract/consent/`, {
    method: "POST",
    body: { decision, note },
  });
}

export async function listPartnerAmendments(): Promise<AmendmentRecord[]> {
  return normalizeList(await apiFetch<unknown>("/partner/contract-amendments/"));
}

export async function createPartnerAmendment(payload: AmendmentCreatePayload): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>("/partner/contract-amendments/", { method: "POST", body: payload });
}

export async function getPartnerAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/partner/contract-amendments/${id}/`);
}

export async function listAdminAmendments(filters: { status?: string; contractType?: string; customer?: string | number } = {}): Promise<AmendmentRecord[]> {
  const query = queryString({
    status: filters.status,
    contract_type: filters.contractType,
    customer: filters.customer === undefined || filters.customer === null ? undefined : String(filters.customer),
  });
  return normalizeList(await apiFetch<unknown>(`/admin/contract-amendments/${query}`));
}

export async function listAdminProductRecontractReport(filters: ProductRecontractReportFilters = {}): Promise<ProductRecontractReportRow[]> {
  const query = queryString({
    executed: filters.executed,
    customer_consent_status: filters.customerConsentStatus,
    admin_approval_status: filters.adminApprovalStatus,
    product: filters.product,
    customer: filters.customer,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
  });
  return normalizeReportRows(await apiFetch<unknown>(`/admin/contract-amendments/recontract-report/${query}`));
}

export async function getAdminAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/`);
}

export async function getAdminLuckyBatchPreview(id: number): Promise<LuckyBatchPreview> {
  return apiFetch<LuckyBatchPreview>(`/admin/contract-amendments/${id}/lucky-batch-preview/`);
}

export async function getAdminDepositSecurityPreview(id: number): Promise<DepositSecurityPreview> {
  return apiFetch<DepositSecurityPreview>(`/admin/contract-amendments/${id}/deposit-security-preview/`);
}

export async function reviewAdminAmendment(id: number, adminNote = ""): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/review/`, { method: "POST", body: { admin_note: adminNote } });
}

export async function approveAdminAmendment(id: number, payload: { approved_values?: Record<string, unknown>; admin_note?: string } = {}): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/approve/`, { method: "POST", body: payload });
}

export async function rejectAdminAmendment(id: number, payload: { rejection_reason: string; admin_note?: string }): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/reject/`, { method: "POST", body: payload });
}

export async function implementAdminContractAmendment(id: number): Promise<AmendmentRecord> {
  return apiFetch<AmendmentRecord>(`/admin/contract-amendments/${id}/implement/`, { method: "POST", body: {} });
}

export function amendmentTypeLabel(value?: string | null): string {
  return AMENDMENT_TYPES.find((row) => row.value === value)?.label ?? value ?? "—";
}

export function amendmentContractTypeLabel(value?: string | null): string {
  if (value === "EMI_SUBSCRIPTION") return "EMI Subscription";
  if (value === "RENT_LEASE") return "Rent / Lease";
  return value ?? "—";
}
