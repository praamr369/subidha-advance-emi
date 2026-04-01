import { request } from "@/services/api";
import type { EmiRecord } from "@/services/emis";
import type { PaymentRegisterRow } from "@/services/payments";
import { getAdminPaymentRegister } from "@/services/payments";

export type ReportAccuracy = {
  mode: "full" | "sampled";
  note: string;
};

export type AdminDashboardSnapshot = {
  financial?: {
    total_revenue?: string | number;
    today_collection?: string | number;
    total_outstanding?: string | number;
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
  batches?: {
    total_batches?: number;
    total_draws?: number;
  };
};

type AdminDashboardResponse = {
  financial?: {
    total_revenue?: string | number;
    today_collection?: string | number;
    total_outstanding?: string | number;
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
  batches?: {
    total_batches?: number;
    total_draws?: number;
  };
};

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

type SubscriptionKpisResponse = {
  total_subscriptions?: number;
  active_subscriptions?: number;
  completed_subscriptions?: number;
  won_subscriptions?: number;
  defaulted_subscriptions?: number;
  total_outstanding?: number | string;
  overdue_emis?: number;
  pending_emis?: number;
  reconciliation_attention_count?: number;
  today_collection?: number | string;
};

type EmiRow = {
  id: number;
  subscription: number;
  customer_name?: string | null;
  customer_phone?: string | null;
  subscription_status?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  month_no?: number | null;
  due_date?: string | null;
  amount: string | number;
  total_paid?: string | number | null;
  paid_amount?: string | number | null;
  waived_amount?: string | number | null;
  balance_amount?: string | number | null;
  outstanding_amount?: string | number | null;
  status?: string | null;
  is_overdue?: boolean;
  overdue_days?: number | null;
};

type BatchRow = {
  id: number;
  batch_code: string;
};

type BatchSummaryResponse = {
  id: number;
  batch_code: string;
  subscription_count: number;
  active_subscription_count: number;
  won_subscription_count: number;
  available_lucky_ids: number;
  assigned_lucky_ids: number;
  won_lucky_ids: number;
  monthly_booked_value: string | number;
  draw_count: number;
};

type ReconciliationAttentionResponse = {
  checked_count: number;
  flagged_count: number;
  results: Array<{
    subscription_id: number;
    subscription_number?: string;
    customer_name: string;
    total_amount: string;
    paid_amount: string;
    waived_amount: string;
    pending_outstanding: string;
    computed_outstanding: string;
    delta: string;
  }>;
  note?: string;
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toResultsArray<T>(
  payload: PaginatedResponse<T> | T[] | null | undefined
): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

function byMethodTotals(rows: PaymentRegisterRow[]) {
  return rows.reduce(
    (acc, row) => {
      if (row.is_reversed) {
        return acc;
      }

      const method = String(row.method || "").toUpperCase();
      const amount = toNumber(row.amount);

      if (method === "CASH") acc.CASH += amount;
      else if (method === "UPI") acc.UPI += amount;
      else if (method === "BANK") acc.BANK += amount;
      else if (method === "CARD") acc.CARD += amount;
      else acc.OTHER += amount;

      return acc;
    },
    { CASH: 0, UPI: 0, BANK: 0, CARD: 0, OTHER: 0 }
  );
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const dashboard = await request<AdminDashboardResponse>("/admin/dashboard/");

  return {
    financial: {
      total_revenue: toNumber(dashboard.financial?.total_revenue),
      today_collection: toNumber(dashboard.financial?.today_collection),
      total_outstanding: toNumber(dashboard.financial?.total_outstanding),
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
    batches: {
      total_batches: toNumber(dashboard.batches?.total_batches),
      total_draws: toNumber(dashboard.batches?.total_draws),
    },
  };
}

export async function getRevenueSummary() {
  const paymentRegister = await getAdminPaymentRegister();

  const rows: PaymentRegisterRow[] = paymentRegister.results;

  const totalAmount = toNumber(paymentRegister.summary.net_collected_amount);
  const grossAmount = toNumber(paymentRegister.summary.gross_amount);
  const reversedAmount = toNumber(paymentRegister.summary.reversed_amount);
  const methodBreakdown = byMethodTotals(rows);

  return {
    rows,
    totalPayments: paymentRegister.summary.active_payments,
    totalAmount,
    total_revenue: totalAmount,
    gross_amount: grossAmount,
    reversed_amount: reversedAmount,
    net_collected_amount: totalAmount,
    methodBreakdown,
    accuracy: {
      mode: "full",
      note: "Revenue summary is sourced from the admin payment register summary. Net collected excludes reversed payments.",
    } as ReportAccuracy,
  };
}

export async function getOverdueSummary() {
  const [kpis, overduePage] = await Promise.all([
    request<SubscriptionKpisResponse>("/admin/subscriptions/kpis/"),
    request<PaginatedResponse<EmiRow> | EmiRow[]>("/admin/emis/?overdue_only=true"),
  ]);

  const rawRows = toResultsArray(overduePage);

  const rows: EmiRecord[] = rawRows.map((row) => ({
    id: row.id,
    subscription: row.subscription,
    customer_name: row.customer_name ?? undefined,
    customer_phone: row.customer_phone ?? undefined,
    subscription_status: row.subscription_status ?? undefined,
    batch_code: row.batch_code ?? undefined,
    lucky_number: row.lucky_number ?? undefined,
    month_no: Number(row.month_no ?? 0),
    due_date: row.due_date ?? "",
    amount: String(row.amount ?? "0"),
    total_paid:
      row.total_paid !== undefined && row.total_paid !== null
        ? String(row.total_paid)
        : undefined,
    paid_amount:
      row.paid_amount !== undefined && row.paid_amount !== null
        ? String(row.paid_amount)
        : undefined,
    waived_amount:
      row.waived_amount !== undefined && row.waived_amount !== null
        ? String(row.waived_amount)
        : undefined,
    balance_amount:
      row.balance_amount !== undefined && row.balance_amount !== null
        ? String(row.balance_amount)
        : undefined,
    outstanding_amount:
      row.outstanding_amount !== undefined && row.outstanding_amount !== null
        ? String(row.outstanding_amount)
        : undefined,
    status: row.status ?? "PENDING",
    is_overdue:
      typeof row.is_overdue === "boolean" ? row.is_overdue : undefined,
    overdue_days:
      typeof row.overdue_days === "number" ? row.overdue_days : undefined,
  }));

  const overdueAmount = rows.reduce(
    (sum, row) =>
      sum + toNumber(row.balance_amount ?? row.outstanding_amount ?? row.amount),
    0
  );

  return {
    rows,
    pendingCount: toNumber(kpis.pending_emis),
    pendingAmount: 0,
    overdueCount: toNumber(kpis.overdue_emis),
    overdueAmount,
    pending_count: toNumber(kpis.pending_emis),
    pending_amount: 0,
    overdue_count: toNumber(kpis.overdue_emis),
    overdue_amount: overdueAmount,
    accuracy: {
      mode: "sampled",
      note: "Overdue count uses backend KPI data. Amount exposure is computed from the current overdue EMI list response.",
    } as ReportAccuracy,
  };
}

export async function getBatchPerformanceSummary() {
  const batchesPage = await request<PaginatedResponse<BatchRow> | BatchRow[]>(
    "/admin/batches/"
  );
  const batches = toResultsArray(batchesPage);

  const rows = await Promise.all(
    batches.slice(0, 50).map(async (batch) => {
      const summary = await request<BatchSummaryResponse>(
        `/admin/batches/${batch.id}/summary/`
      );

      const subscriptionCount = toNumber(summary.subscription_count);
      const activeSubscriptionCount = toNumber(summary.active_subscription_count);
      const wonCount = toNumber(summary.won_subscription_count);
      const drawCount = toNumber(summary.draw_count);
      const winRate =
        subscriptionCount > 0 ? (wonCount / subscriptionCount) * 100 : 0;

      return {
        id: summary.id,
        batchId: summary.id,
        batchCode: summary.batch_code,
        subscriptionCount,
        activeSubscriptionCount,
        wonCount,
        drawCount,
        winRate,
        batch_id: summary.id,
        batch_code: summary.batch_code,
        subscription_count: subscriptionCount,
        active_subscription_count: activeSubscriptionCount,
        won_subscription_count: wonCount,
        available_lucky_ids: toNumber(summary.available_lucky_ids),
        assigned_lucky_ids: toNumber(summary.assigned_lucky_ids),
        won_lucky_ids: toNumber(summary.won_lucky_ids),
        monthly_booked_value: String(summary.monthly_booked_value ?? "0"),
        draw_count: drawCount,
        win_rate: winRate,
      };
    })
  );

  return {
    rows,
    accuracy: {
      mode: "full",
      note: "Batch performance rows are computed from live per-batch summary endpoints.",
    } as ReportAccuracy,
  };
}

export async function getReconciliationSnapshot() {
  const payload = await request<ReconciliationAttentionResponse>(
    "/admin/subscriptions/reconciliation-attention/"
  );

  const flagged = (payload.results || []).map((row) => ({
    id: row.subscription_id,
    subscription_id: row.subscription_id,
    subscription_number:
      row.subscription_number || `SUB-${row.subscription_id}`,
    customer_name: row.customer_name,
    total_amount: String(row.total_amount ?? "0"),
    paid_amount: String(row.paid_amount ?? "0"),
    waived_amount: String(row.waived_amount ?? "0"),
    pending_outstanding: String(row.pending_outstanding ?? "0"),
    computed_outstanding: String(row.computed_outstanding ?? "0"),
    delta: String(row.delta ?? "0"),
    flagged: true,
  }));

  return {
    checkedCount: toNumber(payload.checked_count),
    flaggedCount: toNumber(payload.flagged_count),
    checked_count: toNumber(payload.checked_count),
    flagged_count: toNumber(payload.flagged_count),
    flagged,
    results: flagged,
    guidance:
      payload.note ||
      "Use the reconciliation attention endpoint for operational review and the backend reconciliation command for full verification.",
    accuracy: {
      mode: "full",
      note: "Reconciliation snapshot is sourced from the admin subscription reconciliation-attention endpoint.",
    } as ReportAccuracy,
  };
}
