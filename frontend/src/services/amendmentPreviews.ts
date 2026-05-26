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

export async function previewProductRecontractAmendment(id: number): Promise<ProductRecontractPreview> {
  return apiFetch<ProductRecontractPreview>(`/admin/contract-amendments/${id}/product-recontract-preview/`, {
    method: "POST",
    body: {},
  });
}
