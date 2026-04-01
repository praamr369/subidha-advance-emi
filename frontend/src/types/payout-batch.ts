export type PayoutBatchStatus = "DRAFT" | "FINALIZED" | "CANCELLED";

export interface PayoutBatchLine {
  id: number;
  commission: number;
  partner: number;
  partner_username: string;
  customer_name?: string | null;
  subscription_number?: string | null;
  payment_id?: number | null;
  payment_reference_no?: string | null;
  commission_status?: string;
  settlement_date?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  amount: string;
  created_at: string;
}

export interface PayoutBatchListItem {
  id: number;
  batch_code: string;
  payout_date: string;
  status: PayoutBatchStatus;
  total_amount: string;
  processed_by: number;
  processed_by_username: string;
  line_count: number;
  created_at: string;
}

export interface PayoutBatchListResponse {
  count: number;
  results: PayoutBatchListItem[];
}

export interface PayoutBatchDetail {
  id: number;
  batch_code: string;
  payout_date: string;
  status: PayoutBatchStatus;
  notes: string;
  total_amount: string;
  processed_by: number;
  processed_by_username: string;
  created_at: string;
  updated_at: string;
  lines: PayoutBatchLine[];
}

export interface CreatePayoutBatchPayload {
  commission_ids: number[];
  payout_date?: string;
  notes?: string;
}

export interface CreatePayoutBatchResponse {
  message: string;
  batch_id: number;
  batch_code: string;
  line_count: number;
  total_amount: string;
  status?: PayoutBatchStatus;
}

export interface FinalizePayoutBatchResponse {
  message: string;
  updated: boolean;
  batch: {
    id: number;
    batch_code: string;
    status: PayoutBatchStatus;
    total_amount: string;
    payout_date: string | null;
    updated_at: string | null;
  };
}

export interface CancelPayoutBatchPayload {
  reason?: string;
}

export interface CancelPayoutBatchResponse {
  message: string;
  updated: boolean;
  batch: {
    id: number;
    batch_code: string;
    status: PayoutBatchStatus;
    notes: string;
    total_amount: string;
    payout_date: string | null;
    updated_at: string | null;
  };
}

export interface PayoutBatchPreviewSummary {
  eligible_count: number;
  eligible_amount: string;
  pending_count: number;
  settled_count: number;
}

export interface PayoutBatchPreviewPartnerRow {
  partner_id: number;
  partner_username: string;
  commission_count: number;
  total_commission: string;
  pending_commission: string;
  settled_commission: string;
}

export interface PayoutBatchPreviewResponse {
  summary: PayoutBatchPreviewSummary;
  per_partner: PayoutBatchPreviewPartnerRow[];
  results: Array<{
    id: number;
    partner: number;
    partner_username: string;
    partner_phone?: string | null;
    subscription: number | null;
    subscription_number?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    batch_code?: string | null;
    lucky_number?: number | null;
    payment: number | null;
    payment_amount?: string | null;
    payment_date?: string | null;
    payment_reference_no?: string | null;
    payment_method?: string | null;
    emi: number | null;
    emi_month_no?: number | null;
    commission_rate: string;
    commission_amount: string;
    status: string;
    settlement_date?: string | null;
    payout_batch_id?: number | null;
    payout_batch_code?: string | null;
    payout_batch_status?: string | null;
    reversal_reason?: string | null;
    created_at: string;
    updated_at: string;
  }>;
}
