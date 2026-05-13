export type BusinessTaxMode = "GST_UNREGISTERED" | "GST_REGULAR" | "GST_COMPOSITION";

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
