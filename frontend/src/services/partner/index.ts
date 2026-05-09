import { apiFetch } from "@/lib/api";
import type {
  CanonicalDashboardSummary,
  DashboardDueSubscription,
  DashboardReconciliationSurface,
  DashboardWinnerSurface,
} from "@/services/dashboard-types";

export type PartnerCustomer = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
  created_at?: string;
};

export type SelfUsernameChangePayload = {
  new_username: string;
  current_password: string;
};

export type UsernameChangeResponse = {
  username: string;
  changed: boolean;
  requires_relogin: boolean;
};

export type PartnerSubscription = {
  id: number;
  subscription_number?: string;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  product?: number;
  product_name?: string;
  product_code?: string;
  partner?: number | null;
  partner_name?: string;
  batch?: number | null;
  batch_code?: string | null;
  batch_status?: string;
  lucky_id?: number | null;
  lucky_number?: number | null;
  plan_type?: string;
  tenure_months?: number;
  start_date?: string;
  total_amount?: string;
  monthly_amount?: string;
  status?: string;
  winner_status?: string;
  winner_month?: number | null;
  waived_amount?: string;
  created_at?: string;
  emi_count?: number;
  paid_emi_count?: number;
  pending_emi_count?: number;
  waived_emi_count?: number;
  total_paid_amount?: string;
  outstanding_amount?: string;
  financial_summary?: {
    emi_total?: string | number;
    paid_amount?: string | number;
    waived_amount?: string | number;
    outstanding_amount?: string | number;
  };
  winner_summary?: PartnerSubscriptionWinnerSummary;
  last_payment_date?: string | null;
  next_due_date?: string | null;
  emis?: PartnerSubscriptionEmi[];
};

export type PartnerSubscriptionWinnerSummary = {
  winner_status?: string;
  winner_month?: number | null;
  lucky_id?: number | null;
  lucky_number?: number | null;
  draw_id?: number | null;
  draw_month?: number | null;
  draw_revealed_at?: string | null;
  waiver_scope?: string | null;
  waived_emi_count?: number;
  waived_amount?: string | number;
};

export type PartnerSubscriptionEmi = {
  id: number;
  subscription?: number | null;
  month_no?: number;
  due_date?: string | null;
  amount?: string;
  paid_amount?: string;
  waived_amount?: string;
  outstanding_amount?: string;
  status?: string;
};

export type PartnerSubscriptionDetail = PartnerSubscription;

export type PartnerPayment = {
  id: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_id?: number;
  subscription_number?: string;
  subscription_status?: string;
  subscription_plan_type?: string;
  product_name?: string;
  product_code?: string;
  emi?: number | null;
  emi_id?: number | null;
  emi_month_no?: number | null;
  emi_due_date?: string | null;
  emi_amount?: string | null;
  emi_status?: string | null;
  batch?: number | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no?: string | null;
  payment_date: string;
  paid_at?: string;
  collected_by?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_username?: string | null;
  created_at?: string;
};

export type PartnerCommission = {
  id: number;
  subscription?: number | null;
  emi?: number | null;
  partner?: number | null;
  payment?: number | null;
  commission_rate?: string | number | null;
  commission_amount: string | number;
  status?: string;
  settlement_date?: string | null;
  reversal_reason?: string | null;
  metadata?: Record<string, unknown>;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export type PartnerCommissionListSummary = {
  total_commission: string;
  pending_commission: string;
  settled_commission: string;
};

export type PartnerCommissionListResponse = {
  count: number;
  summary: PartnerCommissionListSummary;
  results: PartnerCommission[];
};

export type PartnerCollectedPayment = {
  id?: number;
  payment?: PartnerPayment;
  detail?: string;
  message?: string;
  reference_no?: string | null;
  request?: PartnerCollectionRequest;
};

export type PartnerEarningsSummary = {
  total_collected?: number | string;
  total_commission?: number | string;
  pending_commission?: number | string;
  settled_commission?: number | string;
  monthly_collection: Array<{
    payment_date__year?: number | null;
    payment_date__month: number | null;
    total: number | string;
  }>;
  monthly_commission: Array<{
    created_at__year?: number | null;
    created_at__month: number | null;
    total: number | string;
  }>;
};

export type PartnerEarningsExportQuery = {
  status?: "PENDING" | "SETTLED" | "REVERSED" | "";
  date_from?: string;
  date_to?: string;
  export_format: "csv" | "pdf";
};

export type PartnerSubscriptionListResponse = {
  count: number;
  results: PartnerSubscription[];
};

export type PartnerCustomerListResponse = {
  count: number;
  results: PartnerCustomer[];
};

export type PartnerCustomerDetailSummary = {
  total_subscriptions: number;
  active_subscriptions: number;
  completed_subscriptions: number;
  won_subscriptions: number;
  defaulted_subscriptions: number;
  pending_emis: number;
  paid_emis: number;
  waived_emis: number;
  total_collected: number | string;
};

export type PartnerCustomerDetailResponse = {
  customer: PartnerCustomer;
  summary: PartnerCustomerDetailSummary;
  subscriptions: PartnerSubscription[];
  recent_payments: PartnerPayment[];
};

export type PartnerPaymentListResponse = {
  count: number;
  total_collected: number | string;
  results: PartnerPayment[];
};

export type PartnerPaymentDetailResponse = {
  payment: PartnerPayment;
  status_label: string;
};

export type PartnerDueSubscription = DashboardDueSubscription;

export type PartnerCollectionRequest = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  amount?: number | string;
  method?: string;
  payment_date?: string;
  submitted_at?: string;
  status?: string;
  reference_no?: string | null;
  review_note?: string | null;
};

export type PartnerCollectionRequestDetail = PartnerCollectionRequest & {
  customer_id?: number | string;
  partner_username?: string | null;
  notes?: string | null;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  approved_payment_id?: number | null;
  approved_emi_id?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type PartnerFollowUpItem = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  reason?: string;
  overdue_days?: number;
  pending_amount?: number | string;
};

export type PartnerDashboardSummary = CanonicalDashboardSummary & {
  total_subscriptions: number;
  won_subscriptions: number;
  total_revenue_collected: number | string;
  total_customers?: number;
  pending_commission?: number | string;
  settled_commission?: number | string;
  defaulted_subscriptions?: number;
  total_commission?: number | string;
  submitted_collection_requests?: number;
  under_review_collection_requests?: number;
  approved_collection_requests?: number;
  rejected_collection_requests?: number;
  cancelled_collection_requests?: number;
};

export type PartnerDashboardResponse = {
  partner: {
    id: number;
    username: string;
    phone: string;
    email?: string;
    role?: string;
  };
  summary: PartnerDashboardSummary;
  due_subscriptions?: PartnerDueSubscription[];
  winner_surface?: DashboardWinnerSurface;
  reconciliation?: DashboardReconciliationSurface;
  recent_collection_requests?: PartnerCollectionRequest[];
  recent_verified_payments?: PartnerPayment[];
  follow_up_queue?: PartnerFollowUpItem[];
};

type LegacyPaginatedResponse<T> = {
  count?: number;
  results?: T[];
};

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

function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

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

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCanonicalDashboardSummary(
  input: Record<string, unknown>
): CanonicalDashboardSummary {
  return {
    subscription_count: toNumber(input.subscription_count, 0),
    active_subscriptions: toNumber(input.active_subscriptions, 0),
    completed_subscriptions: toNumber(input.completed_subscriptions, 0),
    winner_subscriptions: toNumber(input.winner_subscriptions, 0),
    pending_emis: toNumber(input.pending_emis, 0),
    upcoming_emis: toNumber(input.upcoming_emis, 0),
    overdue_emis: toNumber(input.overdue_emis, 0),
    paid_emis: toNumber(input.paid_emis, 0),
    waived_emis: toNumber(input.waived_emis, 0),
    total_paid_amount: toMoneyString(input.total_paid_amount),
    total_pending_amount: toMoneyString(input.total_pending_amount),
    total_waived_amount: toMoneyString(input.total_waived_amount),
    remaining_amount: toMoneyString(input.remaining_amount),
    outstanding_amount: toMoneyString(input.outstanding_amount),
    overdue_amount: toMoneyString(input.overdue_amount),
    upcoming_amount: toMoneyString(input.upcoming_amount),
    next_due_amount:
      input.next_due_amount === null || input.next_due_amount === undefined
        ? null
        : toMoneyString(input.next_due_amount),
    next_due_date: toStringOrUndefined(input.next_due_date) ?? null,
    next_due_is_overdue: toBoolean(input.next_due_is_overdue, false),
    next_due_subscription_id:
      input.next_due_subscription_id === null ||
      input.next_due_subscription_id === undefined
        ? null
        : toNumber(input.next_due_subscription_id),
    next_due_subscription_number:
      toStringOrUndefined(input.next_due_subscription_number) ?? null,
    next_due_product_name:
      toStringOrUndefined(input.next_due_product_name) ?? null,
    next_due_lucky_number:
      input.next_due_lucky_number === null ||
      input.next_due_lucky_number === undefined
        ? null
        : toNumber(input.next_due_lucky_number),
    has_payment_adjustments: toBoolean(input.has_payment_adjustments, false),
  };
}

function normalizeWinnerSurface(input: unknown): DashboardWinnerSurface | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const row = input as Record<string, unknown>;
  return {
    winner_subscriptions: toNumber(row.winner_subscriptions, 0),
    waived_emis: toNumber(row.waived_emis, 0),
    total_waived_amount: toMoneyString(row.total_waived_amount),
    note: toStringOrUndefined(row.note) ?? "",
  };
}

function normalizeReconciliationSurface(
  input: unknown
): DashboardReconciliationSurface | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }

  const row = input as Record<string, unknown>;
  const rawResults = Array.isArray(row.results) ? row.results : [];

  return {
    checked_count: toNumber(row.checked_count, 0),
    flagged_count: toNumber(row.flagged_count, 0),
    results: rawResults.map((item) => {
      const result = (item ?? {}) as Record<string, unknown>;
      return {
        subscription_id: toNumber(result.subscription_id, 0),
        subscription_number:
          toStringOrUndefined(result.subscription_number) ?? "",
        customer_name: toStringOrUndefined(result.customer_name),
        total_amount: toMoneyString(result.total_amount),
        paid_amount: toMoneyString(result.paid_amount),
        waived_amount: toMoneyString(result.waived_amount),
        pending_outstanding: toMoneyString(result.pending_outstanding),
        computed_outstanding: toMoneyString(result.computed_outstanding),
        delta: toMoneyString(result.delta),
      };
    }),
    note: toStringOrUndefined(row.note),
  };
}

function normalizePartnerPayment(item: unknown): PartnerPayment {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    customer:
      row.customer === null || row.customer === undefined
        ? undefined
        : toNumber(row.customer),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    subscription: toNumber(row.subscription),
    subscription_id:
      row.subscription_id === null || row.subscription_id === undefined
        ? undefined
        : toNumber(row.subscription_id),
    subscription_number: toStringOrUndefined(row.subscription_number),
    subscription_status: toStringOrUndefined(row.subscription_status),
    subscription_plan_type: toStringOrUndefined(row.subscription_plan_type),
    product_name: toStringOrUndefined(row.product_name),
    product_code: toStringOrUndefined(row.product_code),
    emi:
      row.emi === null || row.emi === undefined ? null : toNumber(row.emi),
    emi_id:
      row.emi_id === null || row.emi_id === undefined
        ? null
        : toNumber(row.emi_id),
    emi_month_no:
      row.emi_month_no === null || row.emi_month_no === undefined
        ? null
        : toNumber(row.emi_month_no),
    emi_due_date:
      row.emi_due_date === null ? null : toStringOrUndefined(row.emi_due_date),
    emi_amount:
      row.emi_amount === null || row.emi_amount === undefined
        ? null
        : toMoneyString(row.emi_amount),
    emi_status: row.emi_status === null ? null : toStringOrUndefined(row.emi_status),
    batch:
      row.batch === null || row.batch === undefined
        ? null
        : toNumber(row.batch),
    batch_code: toStringOrUndefined(row.batch_code) ?? null,
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
    paid_at: toStringOrUndefined(row.paid_at),
    collected_by:
      row.collected_by === null || row.collected_by === undefined
        ? null
        : toNumber(row.collected_by),
    collected_by_username:
      toStringOrUndefined(row.collected_by_username) ?? null,
    verified_by:
      row.verified_by === null || row.verified_by === undefined
        ? null
        : toNumber(row.verified_by),
    verified_by_username:
      toStringOrUndefined(row.verified_by_username) ?? null,
    created_at: toStringOrUndefined(row.created_at),
  };
}

function normalizePartnerSubscriptionEmi(item: unknown): PartnerSubscriptionEmi {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    subscription:
      row.subscription === null || row.subscription === undefined
        ? null
        : toNumber(row.subscription),
    month_no:
      row.month_no === null || row.month_no === undefined
        ? undefined
        : toNumber(row.month_no),
    due_date: row.due_date === null ? null : toStringOrUndefined(row.due_date),
    amount: toMoneyString(row.amount),
    paid_amount: toMoneyString(row.paid_amount),
    waived_amount: toMoneyString(row.waived_amount),
    outstanding_amount: toMoneyString(row.outstanding_amount),
    status: toStringOrUndefined(row.status),
  };
}

function normalizePartnerWinnerSummary(
  item: unknown
): PartnerSubscriptionWinnerSummary | undefined {
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

function normalizePartnerSubscriptionDetail(payload: unknown): PartnerSubscriptionDetail {
  const row = (payload ?? {}) as Record<string, unknown>;
  const summary = (row.financial_summary ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    subscription_number: toStringOrUndefined(row.subscription_number),
    customer:
      row.customer === null || row.customer === undefined
        ? undefined
        : toNumber(row.customer),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    product:
      row.product === null || row.product === undefined
        ? undefined
        : toNumber(row.product),
    product_name: toStringOrUndefined(row.product_name),
    product_code: toStringOrUndefined(row.product_code),
    partner:
      row.partner === null || row.partner === undefined
        ? null
        : toNumber(row.partner),
    partner_name: toStringOrUndefined(row.partner_username),
    batch:
      row.batch === null || row.batch === undefined ? null : toNumber(row.batch),
    batch_code: toStringOrUndefined(row.batch_code) ?? null,
    batch_status: toStringOrUndefined(row.batch_status),
    lucky_id:
      row.lucky_id === null || row.lucky_id === undefined
        ? null
        : toNumber(row.lucky_id),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    plan_type: toStringOrUndefined(row.plan_type),
    tenure_months:
      row.tenure_months === null || row.tenure_months === undefined
        ? undefined
        : toNumber(row.tenure_months),
    start_date: toStringOrUndefined(row.start_date),
    total_amount: toMoneyString(row.total_amount),
    monthly_amount: toMoneyString(row.monthly_amount),
    status: toStringOrUndefined(row.status),
    winner_status: toStringOrUndefined(row.winner_status),
    winner_month:
      row.winner_month === null || row.winner_month === undefined
        ? null
        : toNumber(row.winner_month),
    waived_amount: toMoneyString(row.waived_amount),
    created_at: toStringOrUndefined(row.created_at),
    emi_count: toNumber(row.emi_count),
    paid_emi_count: toNumber(row.paid_emi_count),
    pending_emi_count: toNumber(row.pending_emi_count),
    waived_emi_count: toNumber(row.waived_emi_count),
    total_paid_amount: toMoneyString(row.total_paid_amount),
    outstanding_amount: toMoneyString(row.outstanding_amount),
    financial_summary: {
      emi_total: toMoneyString(summary.emi_total),
      paid_amount: toMoneyString(summary.paid_amount),
      waived_amount: toMoneyString(summary.waived_amount),
      outstanding_amount: toMoneyString(summary.outstanding_amount),
    },
    winner_summary: normalizePartnerWinnerSummary(row.winner_summary),
    last_payment_date:
      row.last_payment_date === null
        ? null
        : toStringOrUndefined(row.last_payment_date),
    next_due_date:
      row.next_due_date === null ? null : toStringOrUndefined(row.next_due_date),
    emis: toArray(row.emis).map(normalizePartnerSubscriptionEmi),
  };
}

function normalizeDueSubscription(item: unknown): PartnerDueSubscription {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : "",
    subscription_id:
      row.subscription_id !== undefined && row.subscription_id !== null
        ? String(row.subscription_id)
        : row.id !== undefined && row.id !== null
          ? String(row.id)
          : "",
    subscription_number:
      toStringOrUndefined(row.subscription_number) ??
      (row.subscription_id !== undefined && row.subscription_id !== null
        ? `SUB-${String(row.subscription_id)}`
        : row.id !== undefined && row.id !== null
          ? `SUB-${String(row.id)}`
          : undefined),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    product_name: toStringOrUndefined(row.product_name),
    batch_code: toStringOrUndefined(row.batch_code),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? undefined
        : String(row.lucky_number),
    due_date: toStringOrUndefined(row.due_date),
    monthly_amount:
      row.monthly_amount === null || row.monthly_amount === undefined
        ? undefined
        : toMoneyString(row.monthly_amount),
    pending_amount:
      row.pending_amount === null || row.pending_amount === undefined
        ? undefined
        : toMoneyString(row.pending_amount),
    overdue_days: toNumber(row.overdue_days, 0),
  };
}

function normalizeCollectionRequest(item: unknown): PartnerCollectionRequest {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : "",
    subscription_id:
      row.subscription_id !== undefined && row.subscription_id !== null
        ? String(row.subscription_id)
        : undefined,
    subscription_number:
      toStringOrUndefined(row.subscription_number) ??
      (row.subscription_id !== undefined && row.subscription_id !== null
        ? `SUB-${String(row.subscription_id)}`
        : undefined),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    amount:
      row.amount === null || row.amount === undefined
        ? undefined
        : toMoneyString(row.amount),
    method: toStringOrUndefined(row.method),
    payment_date: toStringOrUndefined(row.payment_date),
    submitted_at:
      toStringOrUndefined(row.submitted_at) ??
      toStringOrUndefined(row.created_at),
    status: toStringOrUndefined(row.status) ?? "SUBMITTED",
    reference_no: toStringOrUndefined(row.reference_no) ?? null,
    review_note: toStringOrUndefined(row.review_note) ?? null,
  };
}

function normalizeCollectionRequestDetail(
  item: unknown
): PartnerCollectionRequestDetail {
  const row = (item ?? {}) as Record<string, unknown>;
  const base = normalizeCollectionRequest(row);

  return {
    ...base,
    customer_id:
      row.customer_id !== undefined && row.customer_id !== null
        ? String(row.customer_id)
        : undefined,
    partner_username:
      row.partner_username === null ? null : toStringOrUndefined(row.partner_username),
    notes: row.notes === null ? null : toStringOrUndefined(row.notes),
    reviewed_by_username:
      row.reviewed_by_username === null
        ? null
        : toStringOrUndefined(row.reviewed_by_username),
    reviewed_at:
      row.reviewed_at === null ? null : toStringOrUndefined(row.reviewed_at),
    approved_payment_id:
      row.approved_payment_id === null || row.approved_payment_id === undefined
        ? null
        : toNumber(row.approved_payment_id),
    approved_emi_id:
      row.approved_emi_id === null || row.approved_emi_id === undefined
        ? null
        : toNumber(row.approved_emi_id),
    created_at: toStringOrUndefined(row.created_at),
    updated_at: toStringOrUndefined(row.updated_at),
  };
}

function normalizeFollowUpItem(item: unknown): PartnerFollowUpItem {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : "",
    subscription_id:
      row.subscription_id !== undefined && row.subscription_id !== null
        ? String(row.subscription_id)
        : undefined,
    subscription_number:
      toStringOrUndefined(row.subscription_number) ??
      (row.subscription_id !== undefined && row.subscription_id !== null
        ? `SUB-${String(row.subscription_id)}`
        : undefined),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    reason: toStringOrUndefined(row.reason) ?? toStringOrUndefined(row.review_note),
    overdue_days: toNumber(row.overdue_days, 0),
    pending_amount:
      row.pending_amount === null || row.pending_amount === undefined
        ? undefined
        : toMoneyString(row.pending_amount),
  };
}

function normalizeDashboardResponse(payload: unknown): PartnerDashboardResponse {
  const root = (payload ?? {}) as Record<string, unknown>;
  const rawPartner = ((root.partner ?? {}) as Record<string, unknown>) || {};
  const rawSummary = ((root.summary ?? {}) as Record<string, unknown>) || {};
  const canonicalSummary = normalizeCanonicalDashboardSummary(rawSummary);

  return {
    partner: {
      id: toNumber(rawPartner.id),
      username: toStringOrUndefined(rawPartner.username) ?? "",
      phone: toStringOrUndefined(rawPartner.phone) ?? "",
      email: toStringOrUndefined(rawPartner.email),
      role: toStringOrUndefined(rawPartner.role),
    },
    summary: {
      total_subscriptions: toNumber(rawSummary.total_subscriptions, 0),
      active_subscriptions: canonicalSummary.active_subscriptions,
      completed_subscriptions: canonicalSummary.completed_subscriptions ?? 0,
      won_subscriptions: toNumber(rawSummary.won_subscriptions, 0),
      winner_subscriptions: canonicalSummary.winner_subscriptions,
      subscription_count: canonicalSummary.subscription_count,
      pending_emis: canonicalSummary.pending_emis,
      upcoming_emis: canonicalSummary.upcoming_emis,
      overdue_emis: canonicalSummary.overdue_emis,
      paid_emis: canonicalSummary.paid_emis,
      total_revenue_collected: toMoneyString(
        rawSummary.total_revenue_collected,
        "0.00"
      ),
      total_paid_amount: canonicalSummary.total_paid_amount,
      total_customers: toNumber(rawSummary.total_customers, 0),
      pending_commission: toMoneyString(rawSummary.pending_commission, "0.00"),
      settled_commission: toMoneyString(rawSummary.settled_commission, "0.00"),
      defaulted_subscriptions: toNumber(rawSummary.defaulted_subscriptions, 0),
      waived_emis: canonicalSummary.waived_emis,
      total_commission: toMoneyString(rawSummary.total_commission, "0.00"),
      total_pending_amount: canonicalSummary.total_pending_amount,
      total_waived_amount: canonicalSummary.total_waived_amount,
      remaining_amount: canonicalSummary.remaining_amount,
      outstanding_amount: canonicalSummary.outstanding_amount,
      overdue_amount: canonicalSummary.overdue_amount,
      upcoming_amount: canonicalSummary.upcoming_amount,
      next_due_amount: canonicalSummary.next_due_amount,
      next_due_date: canonicalSummary.next_due_date,
      next_due_is_overdue: canonicalSummary.next_due_is_overdue,
      next_due_subscription_id: canonicalSummary.next_due_subscription_id,
      next_due_subscription_number:
        canonicalSummary.next_due_subscription_number,
      next_due_product_name: canonicalSummary.next_due_product_name,
      next_due_lucky_number: canonicalSummary.next_due_lucky_number,
      has_payment_adjustments: canonicalSummary.has_payment_adjustments,
      submitted_collection_requests: toNumber(
        rawSummary.submitted_collection_requests,
        0
      ),
      under_review_collection_requests: toNumber(
        rawSummary.under_review_collection_requests,
        0
      ),
      approved_collection_requests: toNumber(
        rawSummary.approved_collection_requests,
        0
      ),
      rejected_collection_requests: toNumber(
        rawSummary.rejected_collection_requests,
        0
      ),
      cancelled_collection_requests: toNumber(
        rawSummary.cancelled_collection_requests,
        0
      ),
    },
    due_subscriptions: toArray(root.due_subscriptions).map(
      normalizeDueSubscription
    ),
    winner_surface: normalizeWinnerSurface(root.winner_surface),
    reconciliation: normalizeReconciliationSurface(root.reconciliation),
    recent_collection_requests: toArray(root.recent_collection_requests).map(
      normalizeCollectionRequest
    ),
    recent_verified_payments: toArray(root.recent_verified_payments).map(
      normalizePartnerPayment
    ),
    follow_up_queue: toArray(root.follow_up_queue).map(normalizeFollowUpItem),
  };
}

export async function getPartnerDashboard(): Promise<PartnerDashboardResponse> {
  const payload = await apiFetch<unknown>("/partner/dashboard/");
  return normalizeDashboardResponse(payload);
}

export async function changePartnerUsername(
  payload: SelfUsernameChangePayload
): Promise<UsernameChangeResponse> {
  return apiFetch<UsernameChangeResponse>("/partner/profile/username/", {
    method: "PATCH",
    body: payload,
  });
}

export async function listPartnerCustomers(params?: { q?: string }) {
  const search = new URLSearchParams();

  if (params?.q) {
    search.set("q", params.q);
  }

  const query = search.toString();

  return apiFetch<PartnerCustomerListResponse>(
    `/partner/customers/${query ? `?${query}` : ""}`
  );
}

export async function getPartnerCustomerDetail(
  id: number | string
): Promise<PartnerCustomerDetailResponse> {
  const payload = await apiFetch<unknown>(`/partner/customers/${id}/`);
  const root = (payload ?? {}) as Record<string, unknown>;
  const rawCustomer = ((root.customer ?? {}) as Record<string, unknown>) || {};
  const rawSummary = ((root.summary ?? {}) as Record<string, unknown>) || {};

  return {
    customer: {
      id: toNumber(rawCustomer.id),
      name: toStringOrUndefined(rawCustomer.name) ?? "",
      phone: toStringOrUndefined(rawCustomer.phone) ?? "",
      kyc_status: toStringOrUndefined(rawCustomer.kyc_status),
      created_at: toStringOrUndefined(rawCustomer.created_at),
    },
    summary: {
      total_subscriptions: toNumber(rawSummary.total_subscriptions, 0),
      active_subscriptions: toNumber(rawSummary.active_subscriptions, 0),
      completed_subscriptions: toNumber(rawSummary.completed_subscriptions, 0),
      won_subscriptions: toNumber(rawSummary.won_subscriptions, 0),
      defaulted_subscriptions: toNumber(rawSummary.defaulted_subscriptions, 0),
      pending_emis: toNumber(rawSummary.pending_emis, 0),
      paid_emis: toNumber(rawSummary.paid_emis, 0),
      waived_emis: toNumber(rawSummary.waived_emis, 0),
      total_collected: toMoneyString(rawSummary.total_collected, "0.00"),
    },
    subscriptions: toArray(root.subscriptions).map((item) =>
      item as PartnerSubscription
    ),
    recent_payments: toArray(root.recent_payments).map(normalizePartnerPayment),
  };
}

/**
 * Kept only for backward compatibility with older UI code paths.
 * Partner customer creation is not part of the current backend P1 read API.
 */
export async function createPartnerCustomer(payload: {
  name: string;
  phone: string;
  kyc_status?: string;
}) {
  void payload;
  throw new Error(
    "Partner customer creation is not enabled in the current API. Use admin/customer onboarding flow."
  );
}

export async function listPartnerSubscriptions(params?: {
  status?: string;
  customer?: number | string;
}) {
  const search = new URLSearchParams();

  if (params?.status) {
    search.set("status", params.status);
  }

  if (params?.customer !== undefined && params.customer !== "") {
    search.set("customer", String(params.customer));
  }

  const query = search.toString();

  return apiFetch<PartnerSubscriptionListResponse>(
    `/partner/subscriptions/${query ? `?${query}` : ""}`
  );
}

export async function getPartnerSubscriptionDetail(
  id: number | string
): Promise<PartnerSubscriptionDetail> {
  const payload = await apiFetch<unknown>(`/partner/subscriptions/${id}/`);
  return normalizePartnerSubscriptionDetail(payload);
}

/**
 * Partner-side collection posting is intentionally routed through
 * request-based workflow, not direct final payment creation.
 */
export async function collectPartnerPayment(payload: {
  subscription: number;
  amount: string | number;
  payment_mode?: string;
  reference_no?: string;
  paid_at?: string;
  notes?: string;
}): Promise<PartnerCollectedPayment> {
  return apiFetch<PartnerCollectedPayment>("/partner/collection-requests/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function normalizePartnerCommissionRow(row: Record<string, unknown>): PartnerCommission {
  const settlement = toStringOrUndefined(row.settlement_date) ?? null;
  return {
    id: toNumber(row.id, 0),
    subscription:
      row.subscription === undefined || row.subscription === null
        ? null
        : toNumber(row.subscription, 0),
    emi: row.emi === undefined || row.emi === null ? null : toNumber(row.emi, 0),
    partner: row.partner === undefined || row.partner === null ? null : toNumber(row.partner, 0),
    payment: row.payment === undefined || row.payment === null ? null : toNumber(row.payment, 0),
    commission_rate:
      row.commission_rate === undefined || row.commission_rate === null
        ? undefined
        : String(row.commission_rate),
    commission_amount: toMoneyString(row.commission_amount),
    status: toStringOrUndefined(row.status),
    settlement_date: settlement,
    reversal_reason: toStringOrUndefined(row.reversal_reason) ?? "",
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {},
    approved_at: settlement,
    paid_at: settlement,
    created_at: toStringOrUndefined(row.created_at),
    updated_at: toStringOrUndefined(row.updated_at) ?? null,
  };
}

export async function listPartnerCommissions(params?: {
  status?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
}): Promise<PartnerCommissionListResponse> {
  const payload = await apiFetch<unknown>(
    `/partner/commissions/${buildQuery({
      status: params?.status,
      date_from: params?.date_from,
      date_to: params?.date_to,
      q: params?.q,
    })}`
  );
  const root = (payload ?? {}) as Record<string, unknown>;
  const summaryRaw = (root.summary ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    summary: {
      total_commission: toMoneyString(summaryRaw.total_commission ?? "0"),
      pending_commission: toMoneyString(summaryRaw.pending_commission ?? "0"),
      settled_commission: toMoneyString(summaryRaw.settled_commission ?? "0"),
    },
    results: toArray(root.results).map((item) =>
      normalizePartnerCommissionRow((item ?? {}) as Record<string, unknown>)
    ),
  };
}

export async function listPartnerPayments(params?: {
  method?: string;
  subscription?: number | string;
  customer?: number | string;
  emi?: number | string;
  q?: string;
}) {
  const search = new URLSearchParams();

  if (params?.method) {
    search.set("method", params.method);
  }

  if (params?.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }

  if (params?.customer !== undefined && params.customer !== "") {
    search.set("customer", String(params.customer));
  }

  if (params?.emi !== undefined && params.emi !== "") {
    search.set("emi", String(params.emi));
  }

  if (params?.q) {
    search.set("q", params.q);
  }

  const query = search.toString();

  return apiFetch<PartnerPaymentListResponse>(
    `/partner/payments/${query ? `?${query}` : ""}`
  );
}

export async function getPartnerPaymentDetail(
  id: number | string
): Promise<PartnerPaymentDetailResponse> {
  const payload = await apiFetch<unknown>(`/partner/payments/${id}/`);
  const root = (payload ?? {}) as Record<string, unknown>;

  return {
    payment: normalizePartnerPayment(root.payment),
    status_label: toStringOrUndefined(root.status_label) ?? "RECORDED",
  };
}

export async function getPartnerEarningsSummary() {
  const payload = await apiFetch<unknown>("/partner/earnings/");
  const root = (payload ?? {}) as Record<string, unknown>;

  return {
    total_collected:
      root.total_collected === undefined || root.total_collected === null
        ? undefined
        : toMoneyString(root.total_collected),
    total_commission:
      root.total_commission === undefined || root.total_commission === null
        ? undefined
        : toMoneyString(root.total_commission),
    pending_commission:
      root.pending_commission === undefined || root.pending_commission === null
        ? undefined
        : toMoneyString(root.pending_commission),
    settled_commission:
      root.settled_commission === undefined || root.settled_commission === null
        ? undefined
        : toMoneyString(root.settled_commission),
    monthly_collection: toArray(root.monthly_collection).map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        payment_date__year:
          row.payment_date__year === undefined || row.payment_date__year === null
            ? null
            : toNumber(row.payment_date__year),
        payment_date__month:
          row.payment_date__month === undefined || row.payment_date__month === null
            ? null
            : toNumber(row.payment_date__month),
        total: toMoneyString(row.total),
      };
    }),
    monthly_commission: toArray(root.monthly_commission).map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        created_at__year:
          row.created_at__year === undefined || row.created_at__year === null
            ? null
            : toNumber(row.created_at__year),
        created_at__month:
          row.created_at__month === undefined || row.created_at__month === null
            ? null
            : toNumber(row.created_at__month),
        total: toMoneyString(row.total),
      };
    }),
  } satisfies PartnerEarningsSummary;
}

export function getPartnerEarningsExportPath(
  params: PartnerEarningsExportQuery
): string {
  return `/partner/earnings/export/${buildQuery({
    status: params.status,
    date_from: params.date_from,
    date_to: params.date_to,
    export_format: params.export_format,
  })}`;
}

export async function getPartnerCollectionRequestDetail(
  id: number | string
): Promise<PartnerCollectionRequestDetail> {
  const payload = await apiFetch<unknown>(`/partner/collection-requests/${id}/`);
  return normalizeCollectionRequestDetail(payload);
}

export type PartnerCollectionRequestListResponse = {
  count: number;
  results: PartnerCollectionRequest[];
};

export async function listPartnerCollectionRequests(params?: {
  subscription?: number | string;
  status?: string;
}): Promise<PartnerCollectionRequestListResponse> {
  const search = new URLSearchParams();
  if (params?.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }
  if (params?.status) {
    search.set("status", params.status);
  }
  const query = search.toString();
  const payload = await apiFetch<unknown>(
    `/partner/collection-requests/${query ? `?${query}` : ""}`
  );
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    results: toArray(root.results).map(normalizeCollectionRequest),
  };
}
