import { apiFetch } from "@/lib/api";

export type ProductRecontractPreview = {
  preview_status: string;
  impact_type: string;
  blocked_reason?: string;
  source_record_mutation: boolean;
  subscription_id?: number;
  subscription_number?: string | null;
  old_product_id?: number | null;
  old_product_name?: string;
  old_product_code?: string;
  new_product_id?: number | null;
  new_product_name?: string;
  new_product_code?: string;
  old_contract_total?: string;
  new_contract_total?: string;
  price_difference?: string;
  amount_already_paid?: string;
  old_remaining_balance?: string;
  proposed_new_remaining_balance?: string;
  current_tenure_months?: number;
  preview_tenure_months?: number;
  current_monthly_amount?: string;
  proposed_monthly_amount?: string;
  pending_emi_count?: number;
  effective_date_preview?: string;
  warnings: string[];
};

export type ContractRecontractExecutionSnapshot = {
  before_subscription?: Record<string, unknown>;
  after_subscription?: Record<string, unknown>;
  before_pending_emis?: Array<Record<string, unknown>>;
  after_pending_emis?: Array<Record<string, unknown>>;
  updated_pending_emi_lines?: Array<Record<string, unknown>>;
  protected_emi_ids?: number[];
  snapshot_policy?: string;
  product_snapshot_updated?: boolean;
  pricing_snapshot_updated?: boolean;
  preservation_flags?: Record<string, boolean>;
};

export type ContractRecontractExecutionFields = {
  executed?: boolean;
  executed_at?: string | null;
  executed_by?: number | null;
  execution_status?: "NOT_EXECUTED" | "EXECUTED" | string;
  execution_snapshot?: ContractRecontractExecutionSnapshot;
  accounting_bridge_posting_id?: number | null;
  journal_entry_id?: number | null;
  reconciliation_item_id?: number | null;
  reconciliation_run_id?: number | null;
  reconciliation_evidence_ids?: number[];
  schedule_line_ids?: number[];
};

export type ContractRecontractEvent = ContractRecontractExecutionFields & {
  id: number;
  amendment_id: number;
  status: string;
  impact_type: string;
  old_product?: number | null;
  old_product_name?: string | null;
  old_product_code?: string | null;
  new_product?: number | null;
  new_product_name?: string | null;
  new_product_code?: string | null;
  old_contract_total: string;
  new_contract_total: string;
  price_difference: string;
  amount_already_paid: string;
  old_remaining_balance: string;
  new_remaining_balance: string;
  current_tenure_months: number;
  preview_tenure_months: number;
  current_monthly_amount: string;
  proposed_monthly_amount: string;
  pending_emi_count: number;
  effective_date_preview?: string | null;
  source_record_mutation: boolean;
  warnings: string[];
  blocked_reason?: string | null;
  created_at?: string;
  created_by_display?: string | null;
  customer_consent_status?: "PENDING" | "ACCEPTED" | "REJECTED";
  customer_consented_by?: number | null;
  customer_consented_by_display?: string | null;
  customer_consented_at?: string | null;
  customer_consent_note?: string | null;
  customer_consent_snapshot?: Record<string, unknown>;
  admin_approval_status?: "PENDING" | "APPROVED" | "REJECTED";
  admin_approved_by?: number | null;
  admin_approved_by_display?: string | null;
  admin_approved_at?: string | null;
  admin_approval_note?: string | null;
  admin_approval_snapshot?: Record<string, unknown>;
  schedule_preview_lines?: ContractRecontractScheduleLine[];
  latest_financial_impact_preview?: ContractRecontractFinancialImpactPreview | null;
  metadata?: Record<string, unknown>;
};

export type ContractRecontractScheduleLine = {
  id: number;
  event: number;
  line_no: number;
  original_emi?: number | null;
  original_due_date?: string | null;
  original_amount?: string | null;
  proposed_due_date: string;
  proposed_amount: string;
  proposed_principal_component?: string | null;
  proposed_status: "PREVIEW_ONLY" | "SUPERSEDED";
  adjustment_type: "EXISTING_PENDING_REPLACEMENT" | "NEW_ADDITIONAL_EMI" | "REDUCED_EMI" | "CREDIT_OFFSET";
  source_record_mutation: boolean;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ContractRecontractFinancialImpactPreview = {
  id: number;
  event: number;
  impact_type: "UPGRADE_EXTRA_PAYABLE" | "DOWNGRADE_CREDIT_REQUIRED" | "SAME_PRICE_REFERENCE_CORRECTION";
  accounting_preview_status: "PREVIEWED" | "SUPERSEDED" | "BLOCKED" | "CANCELLED";
  reconciliation_preview_status: "PREVIEWED" | "SUPERSEDED" | "BLOCKED" | "CANCELLED";
  price_difference: string;
  additional_receivable_amount: string;
  credit_or_reduction_amount: string;
  projected_customer_balance: string;
  projected_future_emi_total: string;
  journal_preview: Record<string, unknown>;
  reconciliation_preview: Record<string, unknown>;
  warnings: string[];
  blocked_reason?: string | null;
  source_record_mutation: boolean;
  created_by?: number | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export async function previewProductRecontractAmendment(id: number): Promise<ProductRecontractPreview> {
  return apiFetch<ProductRecontractPreview>(`/admin/contract-amendments/${id}/product-recontract-preview/`, {
    method: "POST",
    body: {},
  });
}

export async function saveProductRecontractPreviewSnapshot(id: number): Promise<ContractRecontractEvent> {
  return apiFetch<ContractRecontractEvent>(`/admin/contract-amendments/${id}/product-recontract-preview/save/`, {
    method: "POST",
    body: {},
  });
}

export async function listProductRecontractEvents(id: number): Promise<ContractRecontractEvent[]> {
  return apiFetch<ContractRecontractEvent[]>(`/admin/contract-amendments/${id}/product-recontract-events/`);
}

export async function generateProductRecontractSchedulePreview(id: number): Promise<ContractRecontractEvent> {
  return apiFetch<ContractRecontractEvent>(`/admin/contract-amendments/${id}/product-recontract/schedule-preview/`, {
    method: "POST",
    body: {},
  });
}

export async function getProductRecontractSchedulePreview(id: number): Promise<ContractRecontractScheduleLine[]> {
  return apiFetch<ContractRecontractScheduleLine[]>(`/admin/contract-amendments/${id}/product-recontract/schedule-preview/`);
}

export async function generateProductRecontractFinancialImpactPreview(id: number): Promise<ContractRecontractFinancialImpactPreview> {
  return apiFetch<ContractRecontractFinancialImpactPreview>(`/admin/contract-amendments/${id}/product-recontract/financial-impact-preview/`, {
    method: "POST",
    body: {},
  });
}

export async function getProductRecontractFinancialImpactPreview(id: number): Promise<ContractRecontractFinancialImpactPreview[]> {
  return apiFetch<ContractRecontractFinancialImpactPreview[]>(`/admin/contract-amendments/${id}/product-recontract/financial-impact-preview/`);
}

export async function recordProductRecontractAdminDecision(
  amendmentId: number,
  decision: "APPROVED" | "REJECTED",
  note = "",
): Promise<ContractRecontractEvent> {
  return apiFetch<ContractRecontractEvent>(`/admin/contract-amendments/${amendmentId}/product-recontract/admin-decision/`, {
    method: "POST",
    body: { decision, note },
  });
}
