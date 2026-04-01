import { request } from "@/services/api";
import { toPaginated } from "@/services/api/list";
import type { ApiPaginatedResponse } from "@/services/api/types";

export type PaymentRecord = {
  id: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_status?: string;
  emi?: number | null;
  emi_month_no?: number | null;
  batch?: number | null;
  batch_code?: string;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no?: string | null;
  payment_date: string;
  collected_by?: number | null;
  collected_by_username?: string;
  verified_by?: number | null;
  verified_by_username?: string;
  created_at?: string;
  allocation_metadata?: Record<string, unknown> | null;
};

export type PaymentCollectPayload = {
  emi: number;
  amount: string;
  payment_method: string;
  payment_date: string;
  reference_no?: string;
  notes?: string;
};

export type PaymentCollectResponse = {
  payment: PaymentRecord;
  emi: {
    id: number;
    status: string;
    amount: string;
    paid_amount: string;
    outstanding_amount: string;
  };
  subscription: {
    id: number;
    status: string;
  };
};

export type PaymentReversePayload = {
  reason: string;
};

export type PaymentReverseResponse = {
  detail: string;
  payment_id: number;
  emi: {
    id: number;
    status: string;
  };
  subscription: {
    id: number;
    status: string;
  };
};

export type PaymentTimelineLedgerEntry = {
  id: number;
  emi_id: number | null;
  amount: string;
  entry_type: string;
  entry_direction: string;
  allocation_context?: Record<string, unknown>;
  created_at: string;
};

export type PaymentTimelineAuditEntry = {
  id: number;
  action_type: string;
  performed_by: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type PaymentTimelineUnifiedEntry = {
  kind: "ledger" | "reversal_ledger" | "audit";
  timestamp: string;
  payload: Record<string, unknown>;
};

export type PaymentTimelineResponse = {
  payment: PaymentRecord;
  flags?: {
    is_reversed?: boolean;
  };
  reversal?: {
    is_reversed?: boolean;
    reason?: string;
    reversed_by_id?: number | null;
    reversed_by_username?: string | null;
  };
  ledger_entries?: PaymentTimelineLedgerEntry[];
  reversal_ledger_entries?: PaymentTimelineLedgerEntry[];
  audit_logs?: PaymentTimelineAuditEntry[];
  timeline?: PaymentTimelineUnifiedEntry[];
};

export type PaymentQuery = {
  q?: string;
  method?: string;
  subscription?: string | number;
  page?: number;
};

function buildQuery(params: PaymentQuery = {}): string {
  const search = new URLSearchParams();

  if (params.q) search.set("q", params.q);
  if (params.method) search.set("method", params.method);

  if (params.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }

  if (params.page) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listPayments(
  params: PaymentQuery = {}
): Promise<ApiPaginatedResponse<PaymentRecord>> {
  const payload = await request(`/admin/payments/${buildQuery(params)}`);
  return toPaginated<PaymentRecord>(payload);
}

export function getPayment(id: number | string): Promise<PaymentRecord> {
  return request(`/admin/payments/${id}/`);
}

export function getPaymentTimeline(
  id: number | string
): Promise<PaymentTimelineResponse> {
  return request(`/admin/payments/${id}/timeline/`);
}

export async function collectPayment(
  payload: PaymentCollectPayload
): Promise<PaymentCollectResponse> {
  return request("/admin/payments/collect/", {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

export async function reversePayment(
  id: number | string,
  payload: PaymentReversePayload
): Promise<PaymentReverseResponse> {
  return request(`/admin/payments/${id}/reverse/`, {
    method: "POST",
    body: JSON.stringify(payload),
    retryCount: 0,
  });
}

/**
 * Backward-compatible alias for older callers.
 * New code should use collectPayment(...).
 */
export const createPayment = collectPayment;