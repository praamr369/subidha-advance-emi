import { request } from "@/services/api";
import { toPaginated } from "@/services/api/list";
import type { ApiPaginatedResponse } from "@/services/api/types";
import type { DeliveryRecord } from "@/services/deliveries";

export type SubscriptionRecord = {
  id: number;
  subscription_number?: string;
  customer: number;
  customer_name?: string;
  customer_phone?: string;
  product: number;
  product_name?: string;
  product_code?: string;
  batch: number | null;
  batch_code?: string;
  lucky_id: number | null;
  lucky_number?: number;
  plan_type?: string;
  monthly_amount?: string;
  total_amount?: string;
  tenure_months?: number;
  status?: string;
  delivery_status?: string;
  start_date?: string;
  created_at?: string;
  winner_month?: number | null;
  waived_amount?: string;
  contract_reference?: string | null;
  fulfillment_status?: string;
  product_snapshot?: Record<string, unknown> | null;
  pricing_snapshot?: Record<string, unknown> | null;
  financial_summary?: {
    subscription_id?: number;
    total_amount?: string;
    total_emi_amount?: string;
    reversed_amount?: string;
    pending_amount?: string;
    remaining_amount?: string;
    paid_amount?: string;
    waived_amount?: string;
    stored_waived_amount?: string;
    waiver_ledger_amount?: string;
    outstanding_amount?: string;
    emi_total?: string;
    emi_count_total?: number;
    emi_count_paid?: number;
    emi_count_waived?: number;
    emi_count_pending?: number;
    winner_status?: string;
    winner_month?: number | null;
    lucky_id?: number | null;
    lucky_number?: number | null;
    batch?: {
      id?: number | null;
      batch_code?: string | null;
      status?: string | null;
    };
    partner?: {
      id?: number | null;
      username?: string | null;
      phone?: string | null;
      commission_rate?: string;
    };
  };
  reconciliation_flags?: {
    is_financially_consistent?: boolean;
    pending_matches_remaining?: boolean;
    has_reversal_history?: boolean;
    has_waiver_history?: boolean;
    warnings?: string[];
  };
  winner_status?: string;
  winner_summary?: {
    winner_status?: string;
    winner_month?: number | null;
    lucky_id?: number | null;
    lucky_number?: number | null;
    draw_id?: number | null;
    draw_month?: number | null;
    draw_revealed_at?: string | null;
    waiver_scope?: string | null;
    waived_emi_count?: number;
    waived_amount?: string;
  };
  delivery_summary?: DeliveryRecord | null;
  deliveries?: DeliveryRecord[];
  emis?: Array<{
    id: number;
    month_no: number;
    due_date?: string | null;
    amount: string;
    status: string;
    derived_status?: string;
    paid_amount?: string;
    total_paid?: string;
    reversed_amount?: string;
    waived_amount?: string;
    waiver_ledger_amount?: string;
    balance_amount?: string;
    is_overdue?: boolean;
    is_status_consistent?: boolean;
    warnings?: string[];
  }>;
};

export type SubscriptionQuery = {
  q?: string;
  status?: string;
  batch_id?: string | number;
  page?: number;
};

function buildQuery(params: SubscriptionQuery = {}): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.batch_id !== undefined && params.batch_id !== "") search.set("batch_id", String(params.batch_id));
  if (params.page) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listSubscriptions(params: SubscriptionQuery = {}): Promise<ApiPaginatedResponse<SubscriptionRecord>> {
  const payload = await request(`/admin/subscriptions/${buildQuery(params)}`);
  return toPaginated<SubscriptionRecord>(payload);
}

export function getSubscription(id: number | string): Promise<SubscriptionRecord> {
  return request(`/admin/subscriptions/${id}/`);
}
