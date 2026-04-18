import { apiFetch } from "@/lib/api";
import type {
  CanonicalDashboardSummary,
  DashboardDueSubscription,
  DashboardReconciliationSurface,
  DashboardWinnerSurface,
} from "@/services/dashboard-types";

export type AdminDashboardResponse = {
  summary: CanonicalDashboardSummary;
  winner_surface?: DashboardWinnerSurface;
  reconciliation?: DashboardReconciliationSurface;
  due_subscriptions?: DashboardDueSubscription[];
  subscription_kpis?: {
    total_customers: number;
    total_subscriptions: number;
    defaulted_subscriptions: number;
    total_contract_value: string;
    total_monthly_value: string;
    total_waived_value: string;
  };
  commission_summary?: {
    total_commission: string;
    pending_commission: string;
    settled_commission: string;
    reversed_commission: string;
    total_count: number;
    pending_count: number;
    settled_count: number;
    reversed_count: number;
  };
  financial: {
    total_revenue: number | string;
    today_collection: number | string;
    total_outstanding: number | string;
  };
  collections?: {
    today_transaction_count: number;
    today_active_payments: number;
    today_reversed_payments: number;
    today_gross_amount: string;
    today_reversed_amount: string;
    today_net_amount: string;
  };
  emi: {
    pending: number;
    overdue: number;
  };
  subscriptions: {
    active: number;
    completed: number;
    won: number;
  };
  portfolio_mix?: {
    emi: number;
    rent: number;
    lease: number;
  };
  crm?: {
    lead_pipeline: {
      new: number;
      in_progress: number;
      contacted: number;
      converted: number;
      closed: number;
    };
    open_leads: number;
  };
  batches: {
    total_batches: number;
    total_draws: number;
    live_batches?: number;
    open_batches?: number;
    next_draw_batch?: {
      id: number;
      batch_code: string;
      status?: string | null;
      draw_day?: number | null;
      draw_date?: string | null;
      days_until_draw?: number | null;
      subscription_count?: number | null;
      total_slots?: number | null;
      available_slots?: number | null;
    } | null;
  };
  operations?: {
    due_today_emis: number;
    overdue_emis: number;
    open_batches: number;
    next_draw_batch?: AdminDashboardResponse["batches"]["next_draw_batch"];
  };
  risk: {
    healthy: number;
    at_risk: number;
    high_risk: number;
    defaulted: number;
    default_rate: number;
  };
  financial_health: Record<string, unknown>;
  recent_activity?: Array<{
    kind?: string;
    payment_id?: number;
    amount?: string;
    payment_date?: string | null;
    created_at?: string | null;
    method?: string | null;
    reference_no?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    subscription_id?: number | null;
    subscription_number?: string | null;
    batch_code?: string | null;
    lucky_number?: number | null;
    is_reversed?: boolean;
  }>;
};

type AdminDashboardPayload = {
  summary?: Record<string, unknown>;
  winner_surface?: Record<string, unknown>;
  reconciliation?: Record<string, unknown>;
  due_subscriptions?: unknown[];
  subscription_kpis?: Record<string, unknown>;
  commission_summary?: Record<string, unknown>;
  financial?: {
    total_revenue?: number | string;
    today_collection?: number | string;
    total_outstanding?: number | string;
  };
  collections?: {
    today_transaction_count?: number;
    today_active_payments?: number;
    today_reversed_payments?: number;
    today_gross_amount?: string | number;
    today_reversed_amount?: string | number;
    today_net_amount?: string | number;
  };
  emi?: {
    pending?: number;
    overdue?: number;
  };
  subscriptions?: {
    active?: number;
    completed?: number;
    won?: number;
  };
  portfolio_mix?: {
    emi?: number;
    rent?: number;
    lease?: number;
  };
  crm?: {
    lead_pipeline?: Record<string, unknown>;
    open_leads?: number;
  };
  batches?: {
    total_batches?: number;
    total_draws?: number;
    live_batches?: number;
    open_batches?: number;
    next_draw_batch?: Record<string, unknown> | null;
  };
  operations?: {
    due_today_emis?: number;
    overdue_emis?: number;
    open_batches?: number;
    next_draw_batch?: Record<string, unknown> | null;
  };
  risk?: {
    healthy?: number;
    at_risk?: number;
    high_risk?: number;
    defaulted?: number;
    default_rate?: number;
  };
  financial_health?: Record<string, unknown>;
  recent_activity?: unknown[];
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeSummary(
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
      row.next_due_subscription_id === null ||
      row.next_due_subscription_id === undefined
        ? null
        : toNumber(row.next_due_subscription_id),
    next_due_subscription_number: toStringOrNull(row.next_due_subscription_number),
    next_due_product_name: toStringOrNull(row.next_due_product_name),
    next_due_lucky_number:
      row.next_due_lucky_number === null ||
      row.next_due_lucky_number === undefined
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

function normalizeReconciliation(
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
          typeof row.subscription_number === "string"
            ? row.subscription_number
            : "",
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

function normalizeDueSubscriptions(
  payload: unknown[] | undefined
): DashboardDueSubscription[] {
  if (!Array.isArray(payload)) return [];
  return payload.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      id: row.id !== undefined && row.id !== null ? String(row.id) : "",
      subscription_id:
        row.subscription_id !== undefined && row.subscription_id !== null
          ? String(row.subscription_id)
          : undefined,
      subscription_number:
        typeof row.subscription_number === "string"
          ? row.subscription_number
          : undefined,
      customer_id:
        row.customer_id !== undefined && row.customer_id !== null
          ? String(row.customer_id)
          : undefined,
      customer_name:
        typeof row.customer_name === "string" ? row.customer_name : undefined,
      customer_phone:
        typeof row.customer_phone === "string" ? row.customer_phone : undefined,
      product_name:
        typeof row.product_name === "string" ? row.product_name : undefined,
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
        row.emi_id === null || row.emi_id === undefined
          ? null
          : toNumber(row.emi_id),
      month_no:
        row.month_no === null || row.month_no === undefined
          ? null
          : toNumber(row.month_no),
    };
  });
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  const dashboard = await apiFetch<AdminDashboardPayload>("/admin/dashboard/");

  return {
    summary: normalizeSummary(dashboard.summary),
    winner_surface: normalizeWinnerSurface(dashboard.winner_surface),
    reconciliation: normalizeReconciliation(dashboard.reconciliation),
    due_subscriptions: normalizeDueSubscriptions(dashboard.due_subscriptions),
    subscription_kpis: dashboard.subscription_kpis
      ? {
          total_customers: toNumber(dashboard.subscription_kpis.total_customers),
          total_subscriptions: toNumber(
            dashboard.subscription_kpis.total_subscriptions
          ),
          defaulted_subscriptions: toNumber(
            dashboard.subscription_kpis.defaulted_subscriptions
          ),
          total_contract_value: toMoneyString(
            dashboard.subscription_kpis.total_contract_value
          ),
          total_monthly_value: toMoneyString(
            dashboard.subscription_kpis.total_monthly_value
          ),
          total_waived_value: toMoneyString(
            dashboard.subscription_kpis.total_waived_value
          ),
        }
      : undefined,
    commission_summary: dashboard.commission_summary
      ? {
          total_commission: toMoneyString(
            dashboard.commission_summary.total_commission
          ),
          pending_commission: toMoneyString(
            dashboard.commission_summary.pending_commission
          ),
          settled_commission: toMoneyString(
            dashboard.commission_summary.settled_commission
          ),
          reversed_commission: toMoneyString(
            dashboard.commission_summary.reversed_commission
          ),
          total_count: toNumber(dashboard.commission_summary.total_count),
          pending_count: toNumber(dashboard.commission_summary.pending_count),
          settled_count: toNumber(dashboard.commission_summary.settled_count),
          reversed_count: toNumber(dashboard.commission_summary.reversed_count),
        }
      : undefined,
    financial: {
      total_revenue: toNumber(dashboard.financial?.total_revenue),
      today_collection: toNumber(dashboard.financial?.today_collection),
      total_outstanding: toNumber(dashboard.financial?.total_outstanding),
    },
    collections: {
      today_transaction_count: toNumber(
        dashboard.collections?.today_transaction_count
      ),
      today_active_payments: toNumber(
        dashboard.collections?.today_active_payments
      ),
      today_reversed_payments: toNumber(
        dashboard.collections?.today_reversed_payments
      ),
      today_gross_amount: toMoneyString(dashboard.collections?.today_gross_amount),
      today_reversed_amount: toMoneyString(
        dashboard.collections?.today_reversed_amount
      ),
      today_net_amount: toMoneyString(dashboard.collections?.today_net_amount),
    },
    emi: {
      pending: toNumber(dashboard.emi?.pending),
      overdue: toNumber(dashboard.emi?.overdue),
    },
    subscriptions: {
      active: toNumber(dashboard.subscriptions?.active),
      completed: toNumber(dashboard.subscriptions?.completed),
      won: toNumber(dashboard.subscriptions?.won),
    },
    portfolio_mix: dashboard.portfolio_mix
      ? {
          emi: toNumber(dashboard.portfolio_mix.emi),
          rent: toNumber(dashboard.portfolio_mix.rent),
          lease: toNumber(dashboard.portfolio_mix.lease),
        }
      : undefined,
    crm: dashboard.crm
      ? {
          lead_pipeline: {
            new: toNumber(dashboard.crm.lead_pipeline?.new),
            in_progress: toNumber(dashboard.crm.lead_pipeline?.in_progress),
            contacted: toNumber(dashboard.crm.lead_pipeline?.contacted),
            converted: toNumber(dashboard.crm.lead_pipeline?.converted),
            closed: toNumber(dashboard.crm.lead_pipeline?.closed),
          },
          open_leads: toNumber(dashboard.crm.open_leads),
        }
      : undefined,
    batches: {
      total_batches: toNumber(dashboard.batches?.total_batches),
      total_draws: toNumber(dashboard.batches?.total_draws),
      live_batches: toNumber(dashboard.batches?.live_batches),
      open_batches: toNumber(dashboard.batches?.open_batches),
      next_draw_batch: dashboard.batches?.next_draw_batch
        ? {
            id: toNumber(dashboard.batches.next_draw_batch.id),
            batch_code:
              typeof dashboard.batches.next_draw_batch.batch_code === "string"
                ? dashboard.batches.next_draw_batch.batch_code
                : "",
            status: toStringOrNull(dashboard.batches.next_draw_batch.status),
            draw_day:
              dashboard.batches.next_draw_batch.draw_day === null ||
              dashboard.batches.next_draw_batch.draw_day === undefined
                ? null
                : toNumber(dashboard.batches.next_draw_batch.draw_day),
            draw_date: toStringOrNull(
              dashboard.batches.next_draw_batch.draw_date
            ),
            days_until_draw:
              dashboard.batches.next_draw_batch.days_until_draw === null ||
              dashboard.batches.next_draw_batch.days_until_draw === undefined
                ? null
                : toNumber(dashboard.batches.next_draw_batch.days_until_draw),
            subscription_count:
              dashboard.batches.next_draw_batch.subscription_count === null ||
              dashboard.batches.next_draw_batch.subscription_count === undefined
                ? null
                : toNumber(dashboard.batches.next_draw_batch.subscription_count),
            total_slots:
              dashboard.batches.next_draw_batch.total_slots === null ||
              dashboard.batches.next_draw_batch.total_slots === undefined
                ? null
                : toNumber(dashboard.batches.next_draw_batch.total_slots),
            available_slots:
              dashboard.batches.next_draw_batch.available_slots === null ||
              dashboard.batches.next_draw_batch.available_slots === undefined
                ? null
                : toNumber(dashboard.batches.next_draw_batch.available_slots),
          }
        : null,
    },
    operations: {
      due_today_emis: toNumber(dashboard.operations?.due_today_emis),
      overdue_emis: toNumber(dashboard.operations?.overdue_emis),
      open_batches: toNumber(dashboard.operations?.open_batches),
      next_draw_batch: dashboard.operations?.next_draw_batch
        ? {
            id: toNumber(dashboard.operations.next_draw_batch.id),
            batch_code:
              typeof dashboard.operations.next_draw_batch.batch_code === "string"
                ? dashboard.operations.next_draw_batch.batch_code
                : "",
            status: toStringOrNull(dashboard.operations.next_draw_batch.status),
            draw_day:
              dashboard.operations.next_draw_batch.draw_day === null ||
              dashboard.operations.next_draw_batch.draw_day === undefined
                ? null
                : toNumber(dashboard.operations.next_draw_batch.draw_day),
            draw_date: toStringOrNull(
              dashboard.operations.next_draw_batch.draw_date
            ),
            days_until_draw:
              dashboard.operations.next_draw_batch.days_until_draw === null ||
              dashboard.operations.next_draw_batch.days_until_draw === undefined
                ? null
                : toNumber(dashboard.operations.next_draw_batch.days_until_draw),
            subscription_count:
              dashboard.operations.next_draw_batch.subscription_count === null ||
              dashboard.operations.next_draw_batch.subscription_count === undefined
                ? null
                : toNumber(
                    dashboard.operations.next_draw_batch.subscription_count
                  ),
            total_slots:
              dashboard.operations.next_draw_batch.total_slots === null ||
              dashboard.operations.next_draw_batch.total_slots === undefined
                ? null
                : toNumber(dashboard.operations.next_draw_batch.total_slots),
            available_slots:
              dashboard.operations.next_draw_batch.available_slots === null ||
              dashboard.operations.next_draw_batch.available_slots === undefined
                ? null
                : toNumber(
                    dashboard.operations.next_draw_batch.available_slots
                  ),
          }
        : null,
    },
    risk: {
      healthy: toNumber(dashboard.risk?.healthy),
      at_risk: toNumber(dashboard.risk?.at_risk),
      high_risk: toNumber(dashboard.risk?.high_risk),
      defaulted: toNumber(dashboard.risk?.defaulted),
      default_rate: toNumber(dashboard.risk?.default_rate),
    },
    financial_health: {
      ...(dashboard.financial_health ?? {}),
    },
    recent_activity: Array.isArray(dashboard.recent_activity)
      ? dashboard.recent_activity.map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return {
            kind: typeof row.kind === "string" ? row.kind : undefined,
            payment_id:
              row.payment_id === null || row.payment_id === undefined
                ? undefined
                : toNumber(row.payment_id),
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
        })
      : [],
  };
}

/**
 * Generic resource helpers used by EnterpriseCreatePage / EnterpriseDetailPage.
 * Use these only for non-financial resources such as:
 * - batches
 * - customers
 * - products
 * - subscriptions
 * - lucky-ids
 * - lucky-draws
 * - emis
 *
 * Do NOT use generic create/update/delete helpers for payments.
 */
function assertNonFinancialResource(resource: string) {
  const normalized = resource.replace(/^\/+|\/+$/g, "").toLowerCase();

  if (normalized === "payments" || normalized === "admin/payments") {
    throw new Error(
      "Direct payment mutation is disabled. Use the dedicated payment collect service."
    );
  }
}

export async function createResource<TResponse = unknown>(
  resource: string,
  payload: Record<string, unknown> | FormData
) {
  assertNonFinancialResource(resource);

  return apiFetch<TResponse>(`/admin/${resource}/`, {
    method: "POST",
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  });
}

export async function getResource<TResponse = unknown>(
  resource: string,
  id: string | number
) {
  return apiFetch<TResponse>(`/admin/${resource}/${id}/`);
}

export async function listResource<TResponse = unknown>(resource: string) {
  return apiFetch<TResponse>(`/admin/${resource}/`);
}

export async function updateResource<TResponse = unknown>(
  resource: string,
  id: string | number,
  payload: Record<string, unknown> | FormData
) {
  assertNonFinancialResource(resource);

  return apiFetch<TResponse>(`/admin/${resource}/${id}/`, {
    method: "PATCH",
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  });
}

export async function deleteResource(
  resource: string,
  id: string | number
) {
  assertNonFinancialResource(resource);

  return apiFetch(`/admin/${resource}/${id}/`, {
    method: "DELETE",
  });
}
