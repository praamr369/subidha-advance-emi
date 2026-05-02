import { apiFetch } from "@/lib/api";
import { resolveApiMediaUrl } from "@/lib/media";
import type { DeliveryRecord } from "@/services/deliveries";
import { normalizeDeliveryRecord } from "@/services/deliveries";

export type CustomerEmi = {
  id: number;
  subscription?: number;
  sequence_no?: number;
  month_no?: number;
  due_date?: string;
  amount?: number | string;
  paid_amount?: number | string;
  waived_amount?: number | string;
  outstanding_amount?: number | string;
  status?: string;
  updated_at?: string;
  paid_at?: string;
};

export type CustomerSubscriptionFinancialSummary = {
  emi_total?: number | string;
  paid_amount?: number | string;
  waived_amount?: number | string;
  pending_amount?: number | string;
  remaining_amount?: number | string;
  outstanding_amount?: number | string;
};

export type CustomerSubscriptionWinnerSummary = {
  winner_status?: string;
  winner_month?: number | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  draw_id?: number | null;
  draw_month?: number | null;
  draw_revealed_at?: string | null;
  waiver_scope?: string | null;
  waived_emi_count?: number;
  waived_amount?: number | string;
};

export type CustomerSubscription = {
  id: number;
  subscription_number?: string;
  status?: string;
  start_date?: string;

  plan_type?: string;
  total_amount?: number | string;
  monthly_amount?: number | string;
  tenure_months?: number;

  product?: number;
  batch?: number | null;
  lucky_id?: number | null;

  product_name?: string;
  product_code?: string | null;
  product_image?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  emi_count?: number;
  paid_emi_count?: number;
  pending_emi_count?: number;
  waived_emi_count?: number;
  total_paid_amount?: number | string;
  outstanding_amount?: number | string;
  last_payment_date?: string;
  next_due_date?: string;

  winner_status?: string;
  winner_month?: number | null;
  waived_amount?: number | string;
  delivery_status?: string;
  contract_reference?: string | null;
  fulfillment_status?: string;
  product_snapshot?: Record<string, unknown> | null;
  pricing_snapshot?: Record<string, unknown> | null;
  created_at?: string;

  financial_summary?: CustomerSubscriptionFinancialSummary;
  winner_summary?: CustomerSubscriptionWinnerSummary;
  delivery_summary?: DeliveryRecord | null;
  deliveries?: DeliveryRecord[];
  emis?: CustomerEmi[];
};

export type CustomerDashboardResponse = {
  customer: {
    id: number;
    name: string;
    phone: string;
    kyc_status: string;
  };
  summary: {
    subscription_count?: number;
    active_subscriptions: number;
    completed_subscriptions?: number;
    winner_subscriptions?: number;
    pending_emis: number;
    upcoming_emis?: number;
    overdue_emis?: number;
    paid_emis: number;
    total_paid_amount: number | string;
    waived_emis?: number;
    total_pending_amount?: number | string;
    total_waived_amount?: number | string;
    remaining_amount?: number | string;
    outstanding_amount?: number | string;
    overdue_amount?: number | string;
    upcoming_amount?: number | string;
    next_due_amount?: number | string | null;
    next_due_date?: string | null;
    next_due_is_overdue?: boolean;
    next_due_subscription_id?: number | null;
    next_due_subscription_number?: string | null;
    next_due_product_name?: string | null;
    next_due_lucky_number?: number | null;
    has_payment_adjustments?: boolean;
    under_verification_requests?: number;
  };
  subscriptions: CustomerSubscription[];
};

export type CustomerProfileResponse = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  kyc_status: string;
  username: string;
  summary: {
    total_subscriptions: number;
    active_subscriptions: number;
    won_subscriptions: number;
    completed_subscriptions: number;
    pending_emis: number;
    paid_emis: number;
    waived_emis: number;
    total_paid_amount: number | string;
    lucky_plan_draw?: Array<{
      subscription_id: number;
      batch_code?: string | null;
      winner_lucky_number?: number | null;
      draw_month?: number | null;
      draw_date?: string | null;
      revealed_at?: string | null;
      public_commit_hash?: string | null;
      verification_status?: string | null;
      waived_emi_count?: number;
      waived_amount?: number | string;
    }>;
  };
};

export type UpdateCustomerProfilePayload = {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
};

export type CustomerSubscriptionListResponse = {
  count: number;
  results: CustomerSubscription[];
};

export type CustomerPayment = {
  id: number;
  customer?: number;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_id?: number | null;
  subscription_number?: string;
  subscription_status?: string;
  subscription_plan_type?: string | null;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  emi?: number | null;
  emi_id?: number | null;
  emi_month_no?: number | null;
  emi_due_date?: string | null;
  emi_amount?: string | null;
  emi_status?: string | null;
  batch?: number | null;
  batch_id?: number | null;
  batch_code?: string | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no?: string | null;
  payment_date: string;
  allocation_metadata?: Record<string, unknown> | null;
  is_reversed?: boolean;
  reversal_metadata?: Record<string, unknown> | null;
  paid_at?: string;
  collected_by?: number | null;
  collected_by_id?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_id?: number | null;
  verified_by_username?: string | null;
  created_at?: string;
};

export type CustomerPaymentListResponse = {
  count: number;
  total_paid_amount: number | string;
  results: CustomerPayment[];
};

export type CustomerSupportRequest = {
  id: number;
  customer?: number | null;
  customer_name?: string;
  customer_phone?: string;
  payment?: number | null;
  payment_reference_no?: string | null;
  payment_amount?: string | null;
  payment_method?: string | null;
  payment_date?: string | null;
  subscription?: number | null;
  subscription_number?: string | null;
  category: string;
  message: string;
  status: string;
  resolution_summary?: string;
  resolved_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CustomerSupportRequestListResponse = {
  count: number;
  results: CustomerSupportRequest[];
};

export type CustomerSupportRequestCreateResponse = {
  detail?: string;
  request: CustomerSupportRequest;
};

type LegacyPaginatedResponse<T> = {
  count?: number;
  results?: T[];
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toMoneyString(value: unknown, fallback = "0.00"): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : fallback;
  }

  return fallback;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function toArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as LegacyPaginatedResponse<T>).results)
  ) {
    return (payload as LegacyPaginatedResponse<T>).results as T[];
  }

  return [];
}

function normalizeCustomerEmi(item: unknown): CustomerEmi {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    subscription:
      row.subscription === null || row.subscription === undefined
        ? undefined
        : toNumber(row.subscription),
    sequence_no:
      row.sequence_no === null || row.sequence_no === undefined
        ? undefined
        : toNumber(row.sequence_no),
    month_no:
      row.month_no === null || row.month_no === undefined
        ? undefined
        : toNumber(row.month_no),
    due_date: toStringOrUndefined(row.due_date),
    amount:
      row.amount === null || row.amount === undefined
        ? undefined
        : toMoneyString(row.amount),
    paid_amount:
      row.paid_amount === null || row.paid_amount === undefined
        ? undefined
        : toMoneyString(row.paid_amount),
    waived_amount:
      row.waived_amount === null || row.waived_amount === undefined
        ? undefined
        : toMoneyString(row.waived_amount),
    outstanding_amount:
      row.outstanding_amount === null || row.outstanding_amount === undefined
        ? undefined
        : toMoneyString(row.outstanding_amount),
    status: toStringOrUndefined(row.status),
    updated_at: toStringOrUndefined(row.updated_at),
    paid_at: toStringOrUndefined(row.paid_at),
  };
}

function normalizeFinancialSummary(
  item: unknown
): CustomerSubscriptionFinancialSummary {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    emi_total:
      row.emi_total === null || row.emi_total === undefined
        ? undefined
        : toMoneyString(row.emi_total),
    paid_amount:
      row.paid_amount === null || row.paid_amount === undefined
        ? undefined
        : toMoneyString(row.paid_amount),
    waived_amount:
      row.waived_amount === null || row.waived_amount === undefined
        ? undefined
        : toMoneyString(row.waived_amount),
    pending_amount:
      row.pending_amount === null || row.pending_amount === undefined
        ? undefined
        : toMoneyString(row.pending_amount),
    remaining_amount:
      row.remaining_amount === null || row.remaining_amount === undefined
        ? undefined
        : toMoneyString(row.remaining_amount),
    outstanding_amount:
      row.outstanding_amount === null || row.outstanding_amount === undefined
        ? undefined
        : toMoneyString(row.outstanding_amount),
  };
}

function normalizeWinnerSummary(
  item: unknown
): CustomerSubscriptionWinnerSummary | undefined {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }

  const row = item as Record<string, unknown>;

  return {
    winner_status: toStringOrUndefined(row.winner_status),
    winner_month:
      row.winner_month === null || row.winner_month === undefined
        ? null
        : toNumber(row.winner_month),
    lucky_id:
      row.lucky_id === null || row.lucky_id === undefined
        ? null
        : toNumber(row.lucky_id),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    draw_id:
      row.draw_id === null || row.draw_id === undefined
        ? null
        : toNumber(row.draw_id),
    draw_month:
      row.draw_month === null || row.draw_month === undefined
        ? null
        : toNumber(row.draw_month),
    draw_revealed_at: toStringOrUndefined(row.draw_revealed_at) ?? null,
    waiver_scope: toStringOrUndefined(row.waiver_scope) ?? null,
    waived_emi_count:
      row.waived_emi_count === null || row.waived_emi_count === undefined
        ? undefined
        : toNumber(row.waived_emi_count),
    waived_amount:
      row.waived_amount === null || row.waived_amount === undefined
        ? undefined
        : toMoneyString(row.waived_amount),
  };
}

export function normalizeCustomerSubscription(item: unknown): CustomerSubscription {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    subscription_number: toStringOrUndefined(row.subscription_number),
    status: toStringOrUndefined(row.status),
    start_date: toStringOrUndefined(row.start_date),

    plan_type: toStringOrUndefined(row.plan_type),
    total_amount:
      row.total_amount === null || row.total_amount === undefined
        ? undefined
        : toMoneyString(row.total_amount),
    monthly_amount:
      row.monthly_amount === null || row.monthly_amount === undefined
        ? undefined
        : toMoneyString(row.monthly_amount),
    tenure_months:
      row.tenure_months === null || row.tenure_months === undefined
        ? undefined
        : toNumber(row.tenure_months),

    product:
      row.product === null || row.product === undefined
        ? undefined
        : toNumber(row.product),
    batch:
      row.batch === null || row.batch === undefined ? null : toNumber(row.batch),
    lucky_id:
      row.lucky_id === null || row.lucky_id === undefined
        ? null
        : toNumber(row.lucky_id),

    product_name: toStringOrUndefined(row.product_name),
    product_code: toStringOrUndefined(row.product_code) ?? null,
    product_image: resolveApiMediaUrl(toStringOrUndefined(row.product_image) ?? null),
    batch_code: toStringOrUndefined(row.batch_code) ?? null,
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    emi_count:
      row.emi_count === null || row.emi_count === undefined
        ? undefined
        : toNumber(row.emi_count),
    paid_emi_count:
      row.paid_emi_count === null || row.paid_emi_count === undefined
        ? undefined
        : toNumber(row.paid_emi_count),
    pending_emi_count:
      row.pending_emi_count === null || row.pending_emi_count === undefined
        ? undefined
        : toNumber(row.pending_emi_count),
    waived_emi_count:
      row.waived_emi_count === null || row.waived_emi_count === undefined
        ? undefined
        : toNumber(row.waived_emi_count),
    total_paid_amount:
      row.total_paid_amount === null || row.total_paid_amount === undefined
        ? undefined
        : toMoneyString(row.total_paid_amount),
    outstanding_amount:
      row.outstanding_amount === null || row.outstanding_amount === undefined
        ? undefined
        : toMoneyString(row.outstanding_amount),
    last_payment_date: toStringOrUndefined(row.last_payment_date),
    next_due_date: toStringOrUndefined(row.next_due_date),

    winner_status: toStringOrUndefined(row.winner_status),
    winner_month:
      row.winner_month === null || row.winner_month === undefined
        ? null
        : toNumber(row.winner_month),
    waived_amount:
      row.waived_amount === null || row.waived_amount === undefined
        ? undefined
        : toMoneyString(row.waived_amount),
    delivery_status: toStringOrUndefined(row.delivery_status),
    contract_reference: toStringOrUndefined(row.contract_reference) ?? null,
    fulfillment_status: toStringOrUndefined(row.fulfillment_status),
    product_snapshot:
      row.product_snapshot && typeof row.product_snapshot === "object"
        ? (row.product_snapshot as Record<string, unknown>)
        : null,
    pricing_snapshot:
      row.pricing_snapshot && typeof row.pricing_snapshot === "object"
        ? (row.pricing_snapshot as Record<string, unknown>)
        : null,
    created_at: toStringOrUndefined(row.created_at),

    financial_summary: normalizeFinancialSummary(row.financial_summary),
    winner_summary: normalizeWinnerSummary(row.winner_summary),
    delivery_summary:
      row.delivery_summary === null || row.delivery_summary === undefined
        ? null
        : normalizeDeliveryRecord(row.delivery_summary),
    deliveries: toArray(row.deliveries).map(normalizeDeliveryRecord),
    emis: toArray(row.emis).map(normalizeCustomerEmi),
  };
}

function normalizeCustomerPayment(item: unknown): CustomerPayment {
  const row = (item ?? {}) as Record<string, unknown>;
  const subscriptionId =
    row.subscription_id === null || row.subscription_id === undefined
      ? row.subscription
      : row.subscription_id;
  const emiId =
    row.emi_id === null || row.emi_id === undefined ? row.emi : row.emi_id;
  const batchId =
    row.batch_id === null || row.batch_id === undefined ? row.batch : row.batch_id;
  const customerId =
    row.customer_id === null || row.customer_id === undefined
      ? row.customer
      : row.customer_id;

  return {
    id: toNumber(row.id),
    customer:
      row.customer === null || row.customer === undefined
        ? undefined
        : toNumber(row.customer),
    customer_id:
      customerId === null || customerId === undefined ? null : toNumber(customerId),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    subscription: toNumber(subscriptionId),
    subscription_id:
      subscriptionId === null || subscriptionId === undefined
        ? null
        : toNumber(subscriptionId),
    subscription_number:
      toStringOrUndefined(row.subscription_number) ??
      (subscriptionId === null || subscriptionId === undefined
        ? undefined
        : `SUB-${toNumber(subscriptionId)}`),
    subscription_status: toStringOrUndefined(row.subscription_status),
    subscription_plan_type:
      toStringOrUndefined(row.subscription_plan_type) ?? null,
    product_id:
      row.product_id === null || row.product_id === undefined
        ? null
        : toNumber(row.product_id),
    product_name: toStringOrUndefined(row.product_name) ?? null,
    product_code: toStringOrUndefined(row.product_code) ?? null,
    emi:
      emiId === null || emiId === undefined ? null : toNumber(emiId),
    emi_id: emiId === null || emiId === undefined ? null : toNumber(emiId),
    emi_month_no:
      row.emi_month_no === null || row.emi_month_no === undefined
        ? null
        : toNumber(row.emi_month_no),
    emi_due_date: toStringOrUndefined(row.emi_due_date) ?? null,
    emi_amount:
      row.emi_amount === null || row.emi_amount === undefined
        ? null
        : toMoneyString(row.emi_amount),
    emi_status: toStringOrUndefined(row.emi_status) ?? null,
    batch: batchId === null || batchId === undefined ? null : toNumber(batchId),
    batch_id: batchId === null || batchId === undefined ? null : toNumber(batchId),
    batch_code: toStringOrUndefined(row.batch_code) ?? null,
    lucky_id:
      row.lucky_id === null || row.lucky_id === undefined
        ? null
        : toNumber(row.lucky_id),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    amount: toMoneyString(row.amount),
    method: toStringOrUndefined(row.method) ?? "—",
    reference_no: toStringOrUndefined(row.reference_no) ?? null,
    payment_date:
      toStringOrUndefined(row.payment_date) ??
      toStringOrUndefined(row.paid_at) ??
      "",
    allocation_metadata: toRecordOrNull(row.allocation_metadata),
    is_reversed: toBoolean(row.is_reversed) ?? false,
    reversal_metadata: toRecordOrNull(row.reversal_metadata),
    paid_at: toStringOrUndefined(row.paid_at),
    collected_by:
      row.collected_by === null || row.collected_by === undefined
        ? null
        : toNumber(row.collected_by),
    collected_by_id:
      row.collected_by_id === null || row.collected_by_id === undefined
        ? null
        : toNumber(row.collected_by_id),
    collected_by_username:
      toStringOrUndefined(row.collected_by_username) ?? null,
    verified_by:
      row.verified_by === null || row.verified_by === undefined
        ? null
        : toNumber(row.verified_by),
    verified_by_id:
      row.verified_by_id === null || row.verified_by_id === undefined
        ? null
        : toNumber(row.verified_by_id),
    verified_by_username:
      toStringOrUndefined(row.verified_by_username) ?? null,
    created_at: toStringOrUndefined(row.created_at),
  };
}

function normalizeCustomerSupportRequest(item: unknown): CustomerSupportRequest {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    customer:
      row.customer === null || row.customer === undefined
        ? null
        : toNumber(row.customer),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    payment:
      row.payment === null || row.payment === undefined
        ? null
        : toNumber(row.payment),
    payment_reference_no: toStringOrUndefined(row.payment_reference_no) ?? null,
    payment_amount:
      row.payment_amount === null || row.payment_amount === undefined
        ? null
        : toMoneyString(row.payment_amount),
    payment_method: toStringOrUndefined(row.payment_method) ?? null,
    payment_date: toStringOrUndefined(row.payment_date) ?? null,
    subscription:
      row.subscription === null || row.subscription === undefined
        ? null
        : toNumber(row.subscription),
    subscription_number: toStringOrUndefined(row.subscription_number) ?? null,
    category: toStringOrUndefined(row.category) ?? "OTHER",
    message: toStringOrUndefined(row.message) ?? "",
    status: toStringOrUndefined(row.status) ?? "SUBMITTED",
    resolution_summary: toStringOrUndefined(row.resolution_summary) ?? "",
    resolved_at: toStringOrUndefined(row.resolved_at) ?? null,
    created_at: toStringOrUndefined(row.created_at),
    updated_at: toStringOrUndefined(row.updated_at),
  };
}

function normalizeDashboardResponse(payload: unknown): CustomerDashboardResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const rawCustomer = ((root.customer ?? {}) as Record<string, unknown>) || {};
  const rawSummary = ((root.summary ?? {}) as Record<string, unknown>) || {};

  return {
    customer: {
      id: toNumber(rawCustomer.id),
      name: toStringOrUndefined(rawCustomer.name) ?? "",
      phone: toStringOrUndefined(rawCustomer.phone) ?? "",
      kyc_status: toStringOrUndefined(rawCustomer.kyc_status) ?? "",
    },
    summary: {
      subscription_count: toNumber(rawSummary.subscription_count, 0),
      active_subscriptions: toNumber(rawSummary.active_subscriptions, 0),
      completed_subscriptions: toNumber(rawSummary.completed_subscriptions, 0),
      winner_subscriptions: toNumber(rawSummary.winner_subscriptions, 0),
      pending_emis: toNumber(rawSummary.pending_emis, 0),
      upcoming_emis: toNumber(rawSummary.upcoming_emis, 0),
      overdue_emis: toNumber(rawSummary.overdue_emis, 0),
      paid_emis: toNumber(rawSummary.paid_emis, 0),
      total_paid_amount: toMoneyString(rawSummary.total_paid_amount, "0.00"),
      waived_emis: toNumber(rawSummary.waived_emis, 0),
      total_pending_amount: toMoneyString(rawSummary.total_pending_amount, "0.00"),
      total_waived_amount: toMoneyString(rawSummary.total_waived_amount, "0.00"),
      remaining_amount: toMoneyString(rawSummary.remaining_amount, "0.00"),
      outstanding_amount: toMoneyString(rawSummary.outstanding_amount, "0.00"),
      overdue_amount: toMoneyString(rawSummary.overdue_amount, "0.00"),
      upcoming_amount: toMoneyString(rawSummary.upcoming_amount, "0.00"),
      next_due_amount:
        rawSummary.next_due_amount === null || rawSummary.next_due_amount === undefined
          ? null
          : toMoneyString(rawSummary.next_due_amount, "0.00"),
      next_due_date: toStringOrUndefined(rawSummary.next_due_date) ?? null,
      next_due_is_overdue: toBoolean(rawSummary.next_due_is_overdue) ?? false,
      next_due_subscription_id:
        rawSummary.next_due_subscription_id === null ||
        rawSummary.next_due_subscription_id === undefined
          ? null
          : toNumber(rawSummary.next_due_subscription_id),
      next_due_subscription_number:
        toStringOrUndefined(rawSummary.next_due_subscription_number) ?? null,
      next_due_product_name:
        toStringOrUndefined(rawSummary.next_due_product_name) ?? null,
      next_due_lucky_number:
        rawSummary.next_due_lucky_number === null ||
        rawSummary.next_due_lucky_number === undefined
          ? null
          : toNumber(rawSummary.next_due_lucky_number),
      has_payment_adjustments:
        toBoolean(rawSummary.has_payment_adjustments) ?? false,
      under_verification_requests: toNumber(
        rawSummary.under_verification_requests,
        0
      ),
    },
    subscriptions: toArray(root.subscriptions).map(normalizeCustomerSubscription),
  };
}

function normalizeProfileResponse(payload: unknown): CustomerProfileResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const rawSummary = ((root.summary ?? {}) as Record<string, unknown>) || {};

  return {
    id: toNumber(root.id),
    name: toStringOrUndefined(root.name) ?? "",
    phone: toStringOrUndefined(root.phone) ?? "",
    email: toStringOrUndefined(root.email) ?? "",
    address: toStringOrUndefined(root.address) ?? "",
    city: toStringOrUndefined(root.city) ?? "",
    kyc_status: toStringOrUndefined(root.kyc_status) ?? "",
    username: toStringOrUndefined(root.username) ?? "",
    summary: {
      total_subscriptions: toNumber(rawSummary.total_subscriptions, 0),
      active_subscriptions: toNumber(rawSummary.active_subscriptions, 0),
      won_subscriptions: toNumber(rawSummary.won_subscriptions, 0),
      completed_subscriptions: toNumber(rawSummary.completed_subscriptions, 0),
      pending_emis: toNumber(rawSummary.pending_emis, 0),
      paid_emis: toNumber(rawSummary.paid_emis, 0),
      waived_emis: toNumber(rawSummary.waived_emis, 0),
      total_paid_amount: toMoneyString(rawSummary.total_paid_amount, "0.00"),
      lucky_plan_draw: Array.isArray(rawSummary.lucky_plan_draw)
        ? rawSummary.lucky_plan_draw.map((item) => {
            const row = (item ?? {}) as Record<string, unknown>;
            return {
              subscription_id: toNumber(row.subscription_id, 0),
              batch_code: toStringOrUndefined(row.batch_code) ?? null,
              winner_lucky_number:
                row.winner_lucky_number === null || row.winner_lucky_number === undefined
                  ? null
                  : toNumber(row.winner_lucky_number),
              draw_month:
                row.draw_month === null || row.draw_month === undefined
                  ? null
                  : toNumber(row.draw_month),
              draw_date: toStringOrUndefined(row.draw_date) ?? null,
              revealed_at: toStringOrUndefined(row.revealed_at) ?? null,
              public_commit_hash: toStringOrUndefined(row.public_commit_hash) ?? null,
              verification_status: toStringOrUndefined(row.verification_status) ?? null,
              waived_emi_count:
                row.waived_emi_count === null || row.waived_emi_count === undefined
                  ? 0
                  : toNumber(row.waived_emi_count),
              waived_amount:
                row.waived_amount === null || row.waived_amount === undefined
                  ? "0.00"
                  : toMoneyString(row.waived_amount),
            };
          })
        : [],
    },
  };
}

function normalizePaymentListResponse(
  payload: unknown
): CustomerPaymentListResponse {
  const root = (payload ?? {}) as Record<string, unknown>;

  return {
    count: toNumber(root.count, 0),
    total_paid_amount: toMoneyString(root.total_paid_amount, "0.00"),
    results: toArray(root.results).map(normalizeCustomerPayment),
  };
}

function normalizeSubscriptionListResponse(
  payload: unknown
): CustomerSubscriptionListResponse {
  const root = (payload ?? {}) as Record<string, unknown>;

  return {
    count: toNumber(root.count, 0),
    results: toArray(root.results).map(normalizeCustomerSubscription),
  };
}

export async function getCustomerDashboard(): Promise<CustomerDashboardResponse> {
  const payload = await apiFetch<unknown>("/customer/dashboard/");
  return normalizeDashboardResponse(payload);
}

export async function getCustomerProfile(): Promise<CustomerProfileResponse> {
  const payload = await apiFetch<unknown>("/customer/profile/");
  return normalizeProfileResponse(payload);
}

export async function updateCustomerProfile(
  payload: UpdateCustomerProfilePayload
): Promise<CustomerProfileResponse> {
  const response = await apiFetch<unknown>("/customer/profile/", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return normalizeProfileResponse(response);
}

export async function listCustomerSubscriptions(params?: { status?: string }) {
  const search = new URLSearchParams();

  if (params?.status) {
    search.set("status", params.status);
  }

  const query = search.toString();
  const payload = await apiFetch<unknown>(
    `/customer/subscriptions/${query ? `?${query}` : ""}`
  );

  return normalizeSubscriptionListResponse(payload);
}

export async function getCustomerSubscription(
  id: number | string
): Promise<CustomerSubscription> {
  const payload = await apiFetch<unknown>(`/customer/subscriptions/${id}/`);
  return normalizeCustomerSubscription(payload);
}

export async function listCustomerPayments(params?: {
  subscription?: number | string;
  emi?: number | string;
  method?: string;
}) {
  const search = new URLSearchParams();

  if (params?.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }

  if (params?.emi !== undefined && params.emi !== "") {
    search.set("emi", String(params.emi));
  }

  if (params?.method) {
    search.set("method", params.method);
  }

  const query = search.toString();
  const payload = await apiFetch<unknown>(
    `/customer/payments/${query ? `?${query}` : ""}`
  );

  return normalizePaymentListResponse(payload);
}

export async function getCustomerPaymentDetail(
  id: number | string
): Promise<CustomerPayment> {
  const payload = await apiFetch<unknown>(`/customer/payments/${id}/`);
  return normalizeCustomerPayment(payload);
}

export type CustomerDirectSaleListItem = {
  id: number;
  document_number?: string;
  invoice_number?: string | null;
  sale_date?: string;
  status?: string;
  grand_total?: string;
  paid_amount?: string;
  outstanding_amount?: string;
  delivery_required?: boolean;
  delivery_status?: string;
  item_count?: number;
  item_names?: string[];
  detail_url?: string;
  invoice_pdf_url?: string | null;
};

export type CustomerDirectSaleReceipt = {
  id: number;
  invoice_id?: number | null;
  invoice_number?: string | null;
  receipt_number?: string | null;
  receipt_date?: string;
  receipt_type?: string;
  amount?: string;
  status?: string;
  payment_method?: string | null;
  reference_no?: string;
  receipt_pdf_url?: string | null;
};

export type CustomerDirectSaleDetail = {
  id: number;
  document_number?: string;
  invoice_number?: string | null;
  invoice_date?: string | null;
  sale_date?: string;
  status?: string;
  tax_mode?: string;
  customer_gstin?: string | null;
  customer_snapshot_place_of_supply?: string;
  customer_snapshot?: Record<string, unknown> | null;
  delivery_required?: boolean;
  delivery_status?: string;
  delivery_snapshot?: Record<string, unknown> | null;
  line_items?: Array<Record<string, unknown>>;
  subtotal?: string;
  discount_total?: string;
  taxable_total?: string;
  tax_total?: string;
  grand_total?: string;
  paid_amount?: string;
  outstanding_amount?: string;
  receipts?: CustomerDirectSaleReceipt[];
  invoice_pdf_url?: string | null;
};

export type CustomerDirectSaleSummary = {
  total_direct_sale_invoices: number;
  total_outstanding_direct_sale_dues: string;
  total_paid_direct_sale_amount: string;
  overdue_direct_sale_count: number;
  latest_direct_sale_invoice?: Record<string, unknown> | null;
};

export type CustomerDirectSaleListResponse = {
  count: number;
  page: number;
  page_size: number;
  results: CustomerDirectSaleListItem[];
};

function normalizeCustomerDirectSaleListItem(item: unknown): CustomerDirectSaleListItem {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    document_number: toStringOrUndefined(row.document_number),
    invoice_number: toStringOrUndefined(row.invoice_number) ?? null,
    sale_date: toStringOrUndefined(row.sale_date),
    status: toStringOrUndefined(row.status),
    grand_total: toMoneyString(row.grand_total),
    paid_amount: toMoneyString(row.paid_amount),
    outstanding_amount: toMoneyString(row.outstanding_amount),
    delivery_required: toBoolean(row.delivery_required),
    delivery_status: toStringOrUndefined(row.delivery_status),
    item_count:
      row.item_count === null || row.item_count === undefined
        ? undefined
        : toNumber(row.item_count),
    item_names: Array.isArray(row.item_names)
      ? row.item_names.filter((entry): entry is string => typeof entry === "string")
      : [],
    detail_url: toStringOrUndefined(row.detail_url),
    invoice_pdf_url: toStringOrUndefined(row.invoice_pdf_url) ?? null,
  };
}

function normalizeCustomerDirectSaleReceipt(item: unknown): CustomerDirectSaleReceipt {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    invoice_id:
      row.invoice_id === null || row.invoice_id === undefined
        ? null
        : toNumber(row.invoice_id),
    invoice_number: toStringOrUndefined(row.invoice_number) ?? null,
    receipt_number: toStringOrUndefined(row.receipt_number) ?? null,
    receipt_date: toStringOrUndefined(row.receipt_date),
    receipt_type: toStringOrUndefined(row.receipt_type),
    amount: toMoneyString(row.amount),
    status: toStringOrUndefined(row.status),
    payment_method: toStringOrUndefined(row.payment_method) ?? null,
    reference_no: toStringOrUndefined(row.reference_no),
    receipt_pdf_url: toStringOrUndefined(row.receipt_pdf_url) ?? null,
  };
}

function normalizeCustomerDirectSaleDetail(payload: unknown): CustomerDirectSaleDetail {
  const row = (payload ?? {}) as Record<string, unknown>;
  return {
    id: toNumber(row.id),
    document_number: toStringOrUndefined(row.document_number),
    invoice_number: toStringOrUndefined(row.invoice_number) ?? null,
    invoice_date: toStringOrUndefined(row.invoice_date) ?? null,
    sale_date: toStringOrUndefined(row.sale_date),
    status: toStringOrUndefined(row.status),
    tax_mode: toStringOrUndefined(row.tax_mode),
    customer_gstin: toStringOrUndefined(row.customer_gstin) ?? null,
    customer_snapshot_place_of_supply: toStringOrUndefined(row.customer_snapshot_place_of_supply),
    customer_snapshot: toRecordOrNull(row.customer_snapshot),
    delivery_required: toBoolean(row.delivery_required),
    delivery_status: toStringOrUndefined(row.delivery_status),
    delivery_snapshot: toRecordOrNull(row.delivery_snapshot),
    line_items: Array.isArray(row.line_items)
      ? row.line_items.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
      : [],
    subtotal: toMoneyString(row.subtotal),
    discount_total: toMoneyString(row.discount_total),
    taxable_total: toMoneyString(row.taxable_total),
    tax_total: toMoneyString(row.tax_total),
    grand_total: toMoneyString(row.grand_total),
    paid_amount: toMoneyString(row.paid_amount),
    outstanding_amount: toMoneyString(row.outstanding_amount),
    receipts: Array.isArray(row.receipts)
      ? row.receipts.map(normalizeCustomerDirectSaleReceipt)
      : [],
    invoice_pdf_url: toStringOrUndefined(row.invoice_pdf_url) ?? null,
  };
}

export async function listCustomerDirectSales(params?: { page?: number; pageSize?: number }) {
  const search = new URLSearchParams();
  if (params?.page) {
    search.set("page", String(params.page));
  }
  if (params?.pageSize) {
    search.set("page_size", String(params.pageSize));
  }
  const query = search.toString();
  const payload = await apiFetch<unknown>(`/customer/direct-sales/${query ? `?${query}` : ""}`);
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    page: toNumber(root.page, 1),
    page_size: toNumber(root.page_size, 20),
    results: toArray(root.results).map(normalizeCustomerDirectSaleListItem),
  } as CustomerDirectSaleListResponse;
}

export async function getCustomerDirectSale(id: number | string): Promise<CustomerDirectSaleDetail> {
  const payload = await apiFetch<unknown>(`/customer/direct-sales/${id}/`);
  return normalizeCustomerDirectSaleDetail(payload);
}

export async function getCustomerDirectSaleSummary(): Promise<CustomerDirectSaleSummary> {
  const payload = await apiFetch<unknown>("/customer/direct-sales/summary/");
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    total_direct_sale_invoices: toNumber(root.total_direct_sale_invoices, 0),
    total_outstanding_direct_sale_dues: toMoneyString(root.total_outstanding_direct_sale_dues),
    total_paid_direct_sale_amount: toMoneyString(root.total_paid_direct_sale_amount),
    overdue_direct_sale_count: toNumber(root.overdue_direct_sale_count, 0),
    latest_direct_sale_invoice:
      root.latest_direct_sale_invoice && typeof root.latest_direct_sale_invoice === "object"
        ? (root.latest_direct_sale_invoice as Record<string, unknown>)
        : null,
  };
}

export async function listCustomerSupportRequests(params?: {
  status?: string;
  category?: string;
}): Promise<CustomerSupportRequestListResponse> {
  const search = new URLSearchParams();

  if (params?.status) {
    search.set("status", params.status);
  }

  if (params?.category) {
    search.set("category", params.category);
  }

  const query = search.toString();
  const payload = await apiFetch<unknown>(
    `/customer/support-requests/${query ? `?${query}` : ""}`
  );
  const root = (payload ?? {}) as Record<string, unknown>;

  return {
    count: toNumber(root.count, 0),
    results: toArray(root.results).map(normalizeCustomerSupportRequest),
  };
}

export async function getCustomerSupportRequest(
  id: number | string
): Promise<CustomerSupportRequest> {
  const payload = await apiFetch<unknown>(`/customer/support-requests/${id}/`);
  return normalizeCustomerSupportRequest(payload);
}

export async function createCustomerSupportRequest(payload: {
  payment?: number;
  subscription?: number;
  category: string;
  message: string;
}): Promise<CustomerSupportRequestCreateResponse> {
  const response = await apiFetch<unknown>("/customer/support-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const root = (response ?? {}) as Record<string, unknown>;

  return {
    detail: toStringOrUndefined(root.detail),
    request: normalizeCustomerSupportRequest(root.request),
  };
}

// ---------------------------------------------------------------------------
// Phase 1 – Customer Self-Service: Photo, KYC, Referrals
// ---------------------------------------------------------------------------

export type CustomerKycDocumentRecord = {
  id: number;
  customer: number;
  document_type: string;
  file: string | null;
  notes: string;
  status: string;
  reviewed_by_username: string | null;
  reviewed_at: string | null;
  rejection_reason: string;
  created_at: string;
};

export type CustomerKycDocumentListResponse = {
  count: number;
  kyc_status: string;
  results: CustomerKycDocumentRecord[];
};

export type CustomerKycSubmitResponse = {
  detail: string;
  kyc_status: string;
  document: CustomerKycDocumentRecord;
};

export type CustomerReferralRecord = {
  id: number;
  referrer: number;
  referrer_name: string;
  referred: number;
  referred_name: string;
  referred_phone: string;
  notes: string;
  commission_enabled: boolean;
  commission_amount: string;
  commission_approved: boolean;
  commission_approved_at: string | null;
  created_at: string;
};

export type CustomerReferralListResponse = {
  count: number;
  commission_summary: {
    total_referrals: number;
    approved_commissions: number;
    total_approved_commission_amount: string;
  };
  results: CustomerReferralRecord[];
};

function normalizeKycDocument(raw: unknown): CustomerKycDocumentRecord {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(r.id ?? 0),
    customer: Number(r.customer ?? 0),
    document_type: typeof r.document_type === "string" ? r.document_type : "",
    file: typeof r.file === "string" ? r.file : null,
    notes: typeof r.notes === "string" ? r.notes : "",
    status: typeof r.status === "string" ? r.status : "PENDING",
    reviewed_by_username:
      typeof r.reviewed_by_username === "string" ? r.reviewed_by_username : null,
    reviewed_at: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
    rejection_reason: typeof r.rejection_reason === "string" ? r.rejection_reason : "",
    created_at: typeof r.created_at === "string" ? r.created_at : "",
  };
}

export async function uploadCustomerPhoto(photoFile: File): Promise<{
  detail: string;
  photo_url: string | null;
}> {
  const form = new FormData();
  form.append("photo", photoFile);
  const response = await apiFetch<unknown>("/customer/profile/photo/", {
    method: "POST",
    body: form,
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: typeof root.detail === "string" ? root.detail : "",
    photo_url: typeof root.photo_url === "string" ? root.photo_url : null,
  };
}

export async function listCustomerKycDocuments(): Promise<CustomerKycDocumentListResponse> {
  const response = await apiFetch<unknown>("/customer/kyc/documents/");
  const root = (response ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as unknown[]).map(normalizeKycDocument)
    : [];
  return {
    count: Number(root.count ?? results.length),
    kyc_status: typeof root.kyc_status === "string" ? root.kyc_status : "PENDING",
    results,
  };
}

export async function submitCustomerKycDocument(payload: {
  document_type: string;
  file: File;
  notes?: string;
}): Promise<CustomerKycSubmitResponse> {
  const form = new FormData();
  form.append("document_type", payload.document_type);
  form.append("file", payload.file);
  if (payload.notes) form.append("notes", payload.notes);
  const response = await apiFetch<unknown>("/customer/kyc/request-update/", {
    method: "POST",
    body: form,
  });
  const root = (response ?? {}) as Record<string, unknown>;
  return {
    detail: typeof root.detail === "string" ? root.detail : "",
    kyc_status: typeof root.kyc_status === "string" ? root.kyc_status : "SUBMITTED",
    document: normalizeKycDocument(root.document),
  };
}

export async function listCustomerReferrals(): Promise<CustomerReferralListResponse> {
  const response = await apiFetch<unknown>("/customer/referrals/");
  const root = (response ?? {}) as Record<string, unknown>;
  const summaryRaw = (root.commission_summary ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results)
    ? (root.results as Record<string, unknown>[]).map((r) => ({
        id: Number(r.id ?? 0),
        referrer: Number(r.referrer ?? 0),
        referrer_name: typeof r.referrer_name === "string" ? r.referrer_name : "",
        referred: Number(r.referred ?? 0),
        referred_name: typeof r.referred_name === "string" ? r.referred_name : "",
        referred_phone: typeof r.referred_phone === "string" ? r.referred_phone : "",
        notes: typeof r.notes === "string" ? r.notes : "",
        commission_enabled: Boolean(r.commission_enabled),
        commission_amount: typeof r.commission_amount === "string" ? r.commission_amount : "0.00",
        commission_approved: Boolean(r.commission_approved),
        commission_approved_at:
          typeof r.commission_approved_at === "string" ? r.commission_approved_at : null,
        created_at: typeof r.created_at === "string" ? r.created_at : "",
      }))
    : [];
  return {
    count: Number(root.count ?? results.length),
    commission_summary: {
      total_referrals: Number(summaryRaw.total_referrals ?? results.length),
      approved_commissions: Number(summaryRaw.approved_commissions ?? 0),
      total_approved_commission_amount:
        typeof summaryRaw.total_approved_commission_amount === "string"
          ? summaryRaw.total_approved_commission_amount
          : "0.00",
    },
    results,
  };
}
