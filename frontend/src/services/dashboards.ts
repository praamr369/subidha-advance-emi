import { apiFetch } from "@/lib/api";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";
import type {
  CanonicalDashboardSummary,
  DashboardDueSubscription,
  DashboardFilters,
  DashboardQuery,
  DashboardRecentPayment,
  DashboardReconciliationRow,
  DashboardReconciliationSurface,
  DashboardSummaryV2Response,
  DashboardSurfaceResponse,
  DashboardWinnerItem,
  DashboardWinnerSurface,
} from "@/services/dashboard-types";

export type DashboardSurfaceKind =
  | "upcoming"
  | "overdue"
  | "recent-payments"
  | "winners"
  | "reconciliation-exceptions";

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toMoneyString(value: unknown, fallback = "0.00"): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : fallback;
}

function buildQuery(params: DashboardQuery = {}): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function normalizeDashboardSummary(
  payload: Record<string, unknown> | undefined
): CanonicalDashboardSummary {
  const row = payload ?? {};
  return {
    subscription_count: toNumber(row.subscription_count, 0),
    active_subscriptions: toNumber(row.active_subscriptions, 0),
    completed_subscriptions: toNumber(row.completed_subscriptions, 0),
    winner_subscriptions: toNumber(row.winner_subscriptions, 0),
    pending_emis: toNumber(row.pending_emis, 0),
    upcoming_emis: toNumber(row.upcoming_emis, 0),
    overdue_emis: toNumber(row.overdue_emis, 0),
    paid_emis: toNumber(row.paid_emis, 0),
    waived_emis: toNumber(row.waived_emis, 0),
    total_paid_amount: toMoneyString(row.total_paid_amount),
    total_pending_amount: toMoneyString(row.total_pending_amount),
    total_waived_amount: toMoneyString(row.total_waived_amount),
    remaining_amount: toMoneyString(row.remaining_amount),
    outstanding_amount: toMoneyString(row.outstanding_amount),
    overdue_amount: toMoneyString(row.overdue_amount),
    upcoming_amount: toMoneyString(row.upcoming_amount),
    next_due_amount:
      row.next_due_amount === null || row.next_due_amount === undefined
        ? null
        : toMoneyString(row.next_due_amount),
    next_due_date: toStringOrNull(row.next_due_date),
    next_due_is_overdue: toBoolean(row.next_due_is_overdue, false),
    next_due_subscription_id:
      row.next_due_subscription_id === null || row.next_due_subscription_id === undefined
        ? null
        : toNumber(row.next_due_subscription_id),
    next_due_subscription_number: toStringOrNull(row.next_due_subscription_number),
    next_due_product_name: toStringOrNull(row.next_due_product_name),
    next_due_lucky_number:
      row.next_due_lucky_number === null || row.next_due_lucky_number === undefined
        ? null
        : toNumber(row.next_due_lucky_number),
    has_payment_adjustments: toBoolean(row.has_payment_adjustments, false),
  };
}

function normalizeWinnerSurface(
  payload: Record<string, unknown> | undefined
): DashboardWinnerSurface | undefined {
  if (!payload) return undefined;
  return {
    winner_subscriptions: toNumber(payload.winner_subscriptions, 0),
    waived_emis: toNumber(payload.waived_emis, 0),
    total_waived_amount: toMoneyString(payload.total_waived_amount),
    note: typeof payload.note === "string" ? payload.note : "",
  };
}

function normalizeReconciliationSurface(
  payload: Record<string, unknown> | undefined
): DashboardReconciliationSurface | undefined {
  if (!payload) return undefined;
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  return {
    checked_count: toNumber(payload.checked_count, 0),
    flagged_count: toNumber(payload.flagged_count, 0),
    results: rawResults.map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        subscription_id: toNumber(row.subscription_id, 0),
        subscription_number:
          typeof row.subscription_number === "string" ? row.subscription_number : "",
        customer_name:
          typeof row.customer_name === "string" ? row.customer_name : undefined,
        total_amount: toMoneyString(row.total_amount),
        paid_amount: toMoneyString(row.paid_amount),
        waived_amount: toMoneyString(row.waived_amount),
        pending_outstanding: toMoneyString(row.pending_outstanding),
        computed_outstanding: toMoneyString(row.computed_outstanding),
        delta: toMoneyString(row.delta),
      };
    }),
    note: typeof payload.note === "string" ? payload.note : undefined,
  };
}

function normalizeFilters(payload: Record<string, unknown> | undefined): DashboardFilters {
  const row = payload ?? {};
  return {
    window:
      typeof row.window === "string" ? (row.window as DashboardFilters["window"]) : "DEFAULT",
    as_of: toStringOrNull(row.as_of),
    start_date: toStringOrNull(row.start_date),
    end_date: toStringOrNull(row.end_date),
  };
}

function normalizeDueSubscription(item: unknown): DashboardDueSubscription {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    id: row.id !== undefined && row.id !== null ? String(row.id) : "",
    subscription_id:
      row.subscription_id !== undefined && row.subscription_id !== null
        ? String(row.subscription_id)
        : undefined,
    subscription_number:
      typeof row.subscription_number === "string" ? row.subscription_number : undefined,
    customer_id:
      row.customer_id !== undefined && row.customer_id !== null
        ? String(row.customer_id)
        : undefined,
    customer_name: typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    product_name: typeof row.product_name === "string" ? row.product_name : undefined,
    batch_code:
      typeof row.batch_code === "string" || row.batch_code === null
        ? (row.batch_code as string | null)
        : undefined,
    lucky_number:
      typeof row.lucky_number === "number"
        ? row.lucky_number
        : typeof row.lucky_number === "string"
        ? row.lucky_number
        : undefined,
    due_date: toStringOrNull(row.due_date),
    monthly_amount:
      row.monthly_amount === null || row.monthly_amount === undefined
        ? undefined
        : toMoneyString(row.monthly_amount),
    pending_amount:
      row.pending_amount === null || row.pending_amount === undefined
        ? undefined
        : toMoneyString(row.pending_amount),
    overdue_days: toNumber(row.overdue_days, 0),
    is_overdue: toBoolean(row.is_overdue, false),
    emi_id:
      row.emi_id === null || row.emi_id === undefined ? null : toNumber(row.emi_id),
    month_no:
      row.month_no === null || row.month_no === undefined ? null : toNumber(row.month_no),
  };
}

function normalizeRecentPayment(item: unknown): DashboardRecentPayment {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    payment_id: toNumber(row.payment_id, 0),
    amount: toMoneyString(row.amount),
    payment_date: toStringOrNull(row.payment_date),
    created_at: toStringOrNull(row.created_at),
    method: toStringOrNull(row.method),
    reference_no: toStringOrNull(row.reference_no),
    customer_name: toStringOrNull(row.customer_name),
    customer_phone: toStringOrNull(row.customer_phone),
    subscription_id:
      row.subscription_id === null || row.subscription_id === undefined
        ? null
        : toNumber(row.subscription_id),
    subscription_number: toStringOrNull(row.subscription_number),
    batch_code: toStringOrNull(row.batch_code),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    is_reversed: toBoolean(row.is_reversed, false),
  };
}

function normalizeWinnerItem(item: unknown): DashboardWinnerItem {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    subscription_id: toNumber(row.subscription_id, 0),
    subscription_number:
      typeof row.subscription_number === "string" ? row.subscription_number : "",
    customer_name: typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone: typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    product_name: typeof row.product_name === "string" ? row.product_name : undefined,
    batch_code: toStringOrNull(row.batch_code),
    lucky_number:
      row.lucky_number === null || row.lucky_number === undefined
        ? null
        : toNumber(row.lucky_number),
    winner_status: toStringOrNull(row.winner_status),
    winner_month:
      row.winner_month === null || row.winner_month === undefined
        ? null
        : toNumber(row.winner_month),
    waived_emi_count: toNumber(row.waived_emi_count, 0),
    waived_amount: toMoneyString(row.waived_amount),
    draw_id:
      row.draw_id === null || row.draw_id === undefined ? null : toNumber(row.draw_id),
    draw_month:
      row.draw_month === null || row.draw_month === undefined
        ? null
        : toNumber(row.draw_month),
    draw_revealed_at: toStringOrNull(row.draw_revealed_at),
    remaining_amount: toMoneyString(row.remaining_amount),
  };
}

function normalizeReconciliationRow(item: unknown): DashboardReconciliationRow {
  const row = (item ?? {}) as Record<string, unknown>;
  return {
    subscription_id: toNumber(row.subscription_id, 0),
    subscription_number:
      typeof row.subscription_number === "string" ? row.subscription_number : "",
    customer_name: typeof row.customer_name === "string" ? row.customer_name : undefined,
    total_amount: toMoneyString(row.total_amount),
    paid_amount: toMoneyString(row.paid_amount),
    waived_amount: toMoneyString(row.waived_amount),
    pending_outstanding: toMoneyString(row.pending_outstanding),
    computed_outstanding: toMoneyString(row.computed_outstanding),
    delta: toMoneyString(row.delta),
  };
}

export async function getDashboardSummaryV2(
  params: DashboardQuery = {}
): Promise<DashboardSummaryV2Response> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/dashboards/summary-v2/${buildQuery(params)}`
  );
  return {
    role: typeof payload.role === "string" ? payload.role : "",
    filters: normalizeFilters(
      payload.filters && typeof payload.filters === "object"
        ? (payload.filters as Record<string, unknown>)
        : undefined
    ),
    summary: normalizeDashboardSummary(
      payload.summary && typeof payload.summary === "object"
        ? (payload.summary as Record<string, unknown>)
        : undefined
    ),
    winner_surface: normalizeWinnerSurface(
      payload.winner_surface && typeof payload.winner_surface === "object"
        ? (payload.winner_surface as Record<string, unknown>)
        : undefined
    ),
    reconciliation: normalizeReconciliationSurface(
      payload.reconciliation && typeof payload.reconciliation === "object"
        ? (payload.reconciliation as Record<string, unknown>)
        : undefined
    ),
    customer:
      payload.customer && typeof payload.customer === "object"
        ? {
            id: toNumber((payload.customer as Record<string, unknown>).id),
            name:
              typeof (payload.customer as Record<string, unknown>).name === "string"
                ? ((payload.customer as Record<string, unknown>).name as string)
                : "",
            phone:
              typeof (payload.customer as Record<string, unknown>).phone === "string"
                ? ((payload.customer as Record<string, unknown>).phone as string)
                : "",
            kyc_status:
              typeof (payload.customer as Record<string, unknown>).kyc_status === "string"
                ? ((payload.customer as Record<string, unknown>).kyc_status as string)
                : "",
          }
        : undefined,
    partner:
      payload.partner && typeof payload.partner === "object"
        ? {
            id: toNumber((payload.partner as Record<string, unknown>).id),
            username:
              typeof (payload.partner as Record<string, unknown>).username === "string"
                ? ((payload.partner as Record<string, unknown>).username as string)
                : "",
            email: toStringOrNull((payload.partner as Record<string, unknown>).email) ?? "",
            phone: toStringOrNull((payload.partner as Record<string, unknown>).phone) ?? "",
            role: toStringOrNull((payload.partner as Record<string, unknown>).role) ?? "",
          }
        : undefined,
  };
}

async function getSurface<T>(
  path: string,
  params: DashboardQuery,
  normalizer: (item: unknown) => T
): Promise<DashboardSurfaceResponse<T>> {
  const payload = await apiFetch<Record<string, unknown>>(
    `/dashboards/${path}/${buildQuery(params)}`
  );
  const rawResults = Array.isArray(payload.results) ? payload.results : [];
  return {
    role: typeof payload.role === "string" ? payload.role : "",
    filters: normalizeFilters(
      payload.filters && typeof payload.filters === "object"
        ? (payload.filters as Record<string, unknown>)
        : undefined
    ),
    count: toNumber(payload.count, rawResults.length),
    page:
      payload.page === null || payload.page === undefined
        ? undefined
        : toNumber(payload.page, 1),
    page_size:
      payload.page_size === null || payload.page_size === undefined
        ? undefined
        : toNumber(payload.page_size, rawResults.length),
    total_pages:
      payload.total_pages === null || payload.total_pages === undefined
        ? undefined
        : toNumber(payload.total_pages, 0),
    ordering:
      typeof payload.ordering === "string" ? payload.ordering : undefined,
    results: rawResults.map(normalizer),
  };
}

export function listDashboardUpcoming(params: DashboardQuery = {}) {
  return getSurface("surfaces/upcoming", params, normalizeDueSubscription);
}

export function listDashboardOverdue(params: DashboardQuery = {}) {
  return getSurface("surfaces/overdue", params, normalizeDueSubscription);
}

export function listDashboardRecentPayments(params: DashboardQuery = {}) {
  return getSurface("surfaces/recent-payments", params, normalizeRecentPayment);
}

export function listDashboardWinners(params: DashboardQuery = {}) {
  return getSurface("surfaces/winners", params, normalizeWinnerItem);
}

export function listDashboardReconciliationExceptions(
  params: DashboardQuery = {}
) {
  return getSurface(
    "surfaces/reconciliation-exceptions",
    params,
    normalizeReconciliationRow
  );
}

export function downloadDashboardSurfaceCsv(
  surface: DashboardSurfaceKind,
  params: DashboardQuery = {}
) {
  return downloadAuthenticatedFile(
    `/dashboards/surfaces/${surface}/export.csv${buildQuery(params)}`,
    `dashboard-${surface}.csv`
  );
}
