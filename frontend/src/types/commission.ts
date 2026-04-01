export type CommissionStatus = "PENDING" | "SETTLED" | "REVERSED";

export interface AdminCommission {
  id: number;
  partner: number;
  partner_username: string;
  subscription: number | null;
  payment: number | null;
  emi: number | null;
  commission_rate: string;
  commission_amount: string;
  status: CommissionStatus;
  settlement_date: string | null;
  payout_batch_id?: number | null;
  payout_batch_code?: string | null;
  payout_batch_status?: string | null;
  reversal_reason: string;
  created_at: string;
  updated_at: string;
}

export interface AdminCommissionListResponse {
  count: number;
  limit: number;
  offset: number;
  results: AdminCommission[];
}

export interface AdminCommissionSummary {
  total_commission: string;
  pending_commission: string;
  settled_commission: string;
  reversed_commission: string;
  expected_commission_total?: string;
  actual_commission_total?: string;
  total_count: number;
  pending_count: number;
  settled_count: number;
  reversed_count: number;
  partner_mismatch_count?: number;
  rate_drift_partner_count?: number;
}

export interface AdminCommissionPartnerSummaryRow {
  partner_id: number;
  partner_username: string;
  total_commission: string;
  pending_commission: string;
  settled_commission: string;
  reversed_commission: string;
  commission_count: number;
}

export interface AdminCommissionSummaryResponse {
  summary: AdminCommissionSummary;
  per_partner: AdminCommissionPartnerSummaryRow[];
}

export interface CommissionReconciliationWarningRow {
  payment_id?: number;
  payment_reference_no?: string | null;
  payment_amount?: string;
  payment_date?: string | null;
  commission_id?: number;
  partner_id?: number | null;
  partner_username?: string;
  expected_commission_amount?: string;
  customer_name?: string;
  customer_phone?: string;
  subscription_id?: number | null;
  subscription_number?: string | null;
  commission_rate?: string;
  commission_amount?: string;
  status?: string;
  settlement_date?: string | null;
  payout_batch_id?: number | null;
  payout_batch_code?: string | null;
  reversal_reason?: string | null;
}

export interface CommissionReconciliationWarningGroup {
  count: number;
  total_payment_amount?: string;
  total_commission_amount?: string;
  results: CommissionReconciliationWarningRow[];
}

export interface CommissionReconciliationPartnerBreakdownRow {
  partner_id: number;
  partner_username: string;
  current_commission_rate?: string;
  payment_count?: number;
  pending_commission: string;
  settled_commission: string;
  expected_commission_total?: string;
  actual_commission_total?: string;
  mismatch_amount?: string;
  has_mismatch?: boolean;
  has_rate_drift?: boolean;
  missing_commission_count?: number;
  total_commission: string;
  commission_count: number;
}

export interface AdminCommissionReconciliationResponse {
  snapshot_generated_at: string;
  filters: {
    partner: number | null;
  };
  overview: AdminCommissionSummary;
  partner_breakdown: CommissionReconciliationPartnerBreakdownRow[];
  warnings: {
    payments_missing_commission: CommissionReconciliationWarningGroup;
    commissions_without_valid_payment: CommissionReconciliationWarningGroup;
    commissions_on_reversed_payments: CommissionReconciliationWarningGroup;
    commissions_zero_rate_or_non_partner: CommissionReconciliationWarningGroup;
  };
}

export interface BulkSettleAdminCommissionsPayload {
  commission_ids: number[];
  settlement_date?: string;
}

export interface BulkSettleAdminCommissionsResponse {
  message: string;
  requested_count: number;
  settled_count: number;
  already_settled_count: number;
  failed_count: number;
  settled_ids: number[];
  already_settled_ids: number[];
  failed: Array<{
    commission_id: number;
    reason: string;
  }>;
}
