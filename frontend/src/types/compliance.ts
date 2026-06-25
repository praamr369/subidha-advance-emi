export type BusinessTaxMode = "GST_UNREGISTERED" | "GST_REGULAR" | "GST_COMPOSITION";
export type LegalRiskStatus =
  | "DRAFT"
  | "CA_REVIEW_REQUIRED"
  | "ADVOCATE_REVIEW_REQUIRED"
  | "APPROVED_FOR_INTERNAL_TEST"
  | "APPROVED_FOR_PUBLIC_LAUNCH"
  | "BLOCKED";

export type BusinessRulePolicy = {
  id: number;
  name: string;
  is_active: boolean;
  plan_type: "PRODUCT_INSTALLMENT" | "DIRECT_SALE" | "RENTAL" | "LEASE";
  benefit_type: "NONE" | "CONTRACTUAL_WAIVER" | "TRADE_DISCOUNT" | "PROMOTIONAL_CREDIT";
  selection_method: "NONE" | "HASH_FAIRNESS" | "ADMIN_APPROVED" | "PERFORMANCE_BASED";
  funding_source: "COMPANY_MARGIN" | "CUSTOMER_POOL_BLOCKED";
  risk_status: LegalRiskStatus;
  refund_sla_working_days: number;
  late_payment_charge_enabled: boolean;
  late_payment_charge_configured: boolean;
  late_payment_charge_label: string;
  partner_receipt_admin_approval_required: boolean;
  kyc_masking_required: boolean;
  deposit_refund_requires_inspection: boolean;
  gst_documents_require_hsn_sac: boolean;
  non_gst_document_labels: string[];
  notes: string;
  created_at?: string;
  updated_at?: string;
};

export type BusinessRulePolicyPayload = Partial<
  Pick<
    BusinessRulePolicy,
    | "name"
    | "plan_type"
    | "benefit_type"
    | "selection_method"
    | "funding_source"
    | "risk_status"
    | "refund_sla_working_days"
    | "late_payment_charge_enabled"
    | "late_payment_charge_configured"
    | "late_payment_charge_label"
    | "partner_receipt_admin_approval_required"
    | "kyc_masking_required"
    | "deposit_refund_requires_inspection"
    | "gst_documents_require_hsn_sac"
    | "non_gst_document_labels"
    | "notes"
  >
>;

export type BusinessRulePolicyReadiness = {
  policy: BusinessRulePolicy;
  tax_profile: TaxProfileSnapshot;
  derived: {
    gst_status: BusinessTaxMode;
    invoice_mode: "NON_GST_BILL" | "GST_TAX_INVOICE";
    tax_invoice_enabled: boolean;
    gst_credit_note_enabled: boolean;
    gst_debit_note_enabled: boolean;
    gst_collection_enabled: boolean;
    receipt_voucher_enabled: boolean;
    refund_voucher_enabled: boolean;
    waiver_public_launch_blocked: boolean;
    partner_final_receipt_blocked_until_admin_approval: boolean;
    deposit_refund_blocked_until_inspection: boolean;
    late_payment_charge_application_enabled: boolean;
    document_labels: string[];
  };
  status: "READY" | "NEEDS_REVIEW" | "BLOCKED";
  blockers: string[];
  warnings: string[];
};

export type BusinessTaxProfile = {
  id: number;
  mode: BusinessTaxMode;
  legal_name: string;
  gstin: string;
  pan: string;
  state_code: string;
  state_name: string;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type TaxProfileSnapshot = {
  profile_id: number;
  mode: BusinessTaxMode;
  is_gst_registered: boolean;
  seller_gstin?: string;
  itc_claimable?: boolean;
  [key: string]: unknown;
};

export type ComplianceTaxProfilePayload = {
  mode: BusinessTaxMode;
  effective_from?: string;
  gstin?: string;
  legal_name?: string;
  pan?: string;
  state_code?: string;
  state_name?: string;
  notes?: string;
};

export type ProductTaxProfile = {
  id: number;
  product: number;
  product_code?: string;
  product_name?: string;
  hsn_code: string;
  tax_category: "GOODS" | "SERVICE" | "MIXED";
  gst_rate: string;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
  notes?: string;
};

export type PartyTaxProfile = {
  id: number;
  party_type: "CUSTOMER" | "SUPPLIER" | "PARTNER" | "VENDOR";
  party_id: number;
  tax_type: "UNREGISTERED" | "REGISTERED" | "COMPOSITION";
  legal_name: string;
  gstin: string;
  pan: string;
  state_code: string;
  state_name: string;
  is_active: boolean;
  notes?: string;
};

export type ComplianceTaxReadiness = {
  tax_mode: TaxProfileSnapshot;
  product_readiness: {
    total_products: number;
    active_product_tax_profiles: number;
    missing_product_tax_profiles: number;
    missing_hsn_code: number;
  };
  party_readiness: {
    active_party_tax_profiles: number;
    missing_legal_name: number;
  };
  gst_features: {
    gstr_enabled: boolean;
    e_invoice_enabled: boolean;
  };
};

export type TurnoverSummary = {
  start_date: string;
  end_date: string;
  aggregate_turnover: string;
  direct_sale_turnover: string;
  rent_turnover: string;
  lease_turnover: string;
  service_turnover: string;
  supplier_gst_paid_not_claimable: string;
  interstate_sale_attempts: number;
};

export type ComplianceAlert = {
  key: string;
  label: string;
  threshold_amount: string;
  current_value: string;
  triggered: boolean;
};
