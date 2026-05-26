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

export type ContractRecontractEvent = {
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
