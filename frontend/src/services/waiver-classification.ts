import { apiFetch } from "@/lib/api";

export type WaiverAccountingMode =
  | "PRE_SUPPLY_CONTRACT_ADJUSTMENT"
  | "PRE_GST_COMMERCIAL_CREDIT"
  | "POST_SUPPLY_GST_CREDIT_NOTE"
  | "POST_SUPPLY_COMMERCIAL_CREDIT_ONLY"
  | "PROMOTIONAL_EXPENSE"
  | "REFUND_VOUCHER"
  | "HYBRID_CA_RULE"
  | "REVIEW_REQUIRED";

export type WaiverDocument =
  | "NONE"
  | "COMMERCIAL_WAIVER_NOTE"
  | "COMMERCIAL_CREDIT_NOTE"
  | "RECEIPT_VOUCHER"
  | "REFUND_VOUCHER"
  | "TAX_INVOICE"
  | "GST_CREDIT_NOTE";

export type WaiverClassificationMatrixRow = {
  scenario: string;
  gst_status: string;
  delivery_status: string;
  invoice_status: string;
  waiver_accounting_mode: WaiverAccountingMode;
  document: WaiverDocument;
  gst_credit_note: boolean;
  description: string;
};

export type WaiverClassificationMatrixResponse = {
  matrix: WaiverClassificationMatrixRow[];
};

export type WaiverClassificationInput = {
  gst_status: string;
  delivery_status: string;
  invoice_status: string;
  waiver_amount?: number;
  waiver_month?: string;
  contract_id?: number;
  customer_id?: number;
};

export type WaiverClassificationResult = {
  waiver_allowed: boolean;
  waiver_accounting_mode: WaiverAccountingMode;
  document_to_generate: WaiverDocument;
  gst_reduction_allowed: boolean;
  ledger_posting_template: string;
  audit_reason: string;
  blockers: string[];
  warnings: string[];
  scenario: string;
};

export async function getWaiverClassificationMatrix() {
  return apiFetch<WaiverClassificationMatrixResponse>("/admin/settings/waiver-classification/");
}

export async function classifyWaiver(input: WaiverClassificationInput) {
  return apiFetch<WaiverClassificationResult>("/admin/settings/waiver-classification/", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
