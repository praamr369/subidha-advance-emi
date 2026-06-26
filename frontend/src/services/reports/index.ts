import { request } from "@/services/api";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
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

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : "";
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

export type AdminAnalyticsSummaryQuery = {
  window?: DashboardWindowPreset;
  as_of?: string;
  start_date?: string;
  end_date?: string;
};

export type AdminAnalyticsSummaryResponse = {
  generated_at: string;
  filters: {
    window: DashboardWindowPreset | "DEFAULT";
    as_of?: string | null;
    start_date?: string | null;
    end_date?: string | null;
  };
  summary: Record<string, unknown>;
  overview: {
    window_net_collections: string;
    window_active_collection_count: number;
    window_reversed_amount: string;
    outstanding_amount: string;
    overdue_emi_count: number;
    overdue_emi_amount: string;
    reconciliation_flagged_count: number;
    delivery_action_count: number;
    direct_sales_window_count: number;
    direct_sales_window_gross_total: string;
    invoice_balance: string;
    open_lead_count: number;
    pending_commission_amount: string;
    pending_commission_count: number;
  };
  collections_trend: {
    summary: {
      count: number;
      active_count: number;
      reversed_count: number;
      gross_amount: string;
      reversed_amount: string;
      net_amount: string;
    };
    points: Array<{
      date: string | null;
      count: number;
      active_count: number;
      reversed_count: number;
      gross_amount: string;
      reversed_amount: string;
      net_amount: string;
    }>;
  };
  payment_method_mix: {
    rows: Array<{
      method: string;
      count: number;
      active_count: number;
      reversed_count: number;
      gross_amount: string;
      reversed_amount: string;
      net_amount: string;
    }>;
    summary: {
      total_net_amount: string;
    };
  };
  receivables_pressure: {
    reference_date: string;
    pending_count: number;
    pending_amount: string;
    overdue_count: number;
    overdue_amount: string;
    aging: Array<{
      bucket: string;
      label: string;
      count: number;
      amount: string;
    }>;
  };
  subscription_mix: {
    plan_type: Array<{ plan_type: string; count: number }>;
    status: Array<{ status: string; count: number }>;
    batch_mix: Array<{
      batch_id: number | null;
      batch_code: string;
      subscription_count: number;
      active_subscription_count: number;
      monthly_booked_value: string;
    }>;
    new_subscriptions_trend: Array<{
      date: string | null;
      count: number;
      monthly_booked_value: string;
    }>;
  };
  contract_performance: {
    status_by_plan: Array<{
      plan_type: string;
      statuses: Record<string, number>;
    }>;
    value_by_plan: Array<{
      plan_type: string;
      count: number;
      active_count: number;
      completed_count: number;
      defaulted_count: number;
      contract_value: string;
      monthly_value: string;
      waived_value: string;
    }>;
    schedule_totals_by_plan: Array<{
      plan_type: string;
      pending_count: number;
      pending_amount: string;
      paid_count: number;
      paid_amount: string;
      waived_count: number;
      waived_amount: string;
      total_count: number;
      total_amount: string;
    }>;
  };
  crm_customer_posture: {
    leads: {
      total_count: number;
      open_count: number;
      converted_count: number;
      by_status: Array<{ status: string; count: number }>;
      by_intent: Array<{ intent: string; count: number }>;
    };
    customers: {
      new_count: number;
      kyc_pending_count: number;
      kyc_verified_count: number;
    };
  };
  reconciliation_posture: {
    checked_count: number;
    flagged_count: number;
    flagged_ratio: number;
    note?: string;
    results: Array<{
      subscription_id: number;
      subscription_number: string;
      customer_name?: string;
      total_amount: string;
      paid_amount: string;
      waived_amount: string;
      pending_outstanding: string;
      computed_outstanding: string;
      delta: string;
    }>;
  };
  delivery_posture: {
    supported: boolean;
    summary: Record<string, unknown>;
  };
  direct_sales_posture: {
    supported: boolean;
    summary: {
      count: number;
      gross_total: string;
    };
    trend: Array<{
      date: string | null;
      count: number;
      gross_total: string;
    }>;
  };
  invoice_document_posture: {
    supported: boolean;
    summary: {
      invoice_count: number;
      invoice_total: string;
      invoice_balance: string;
      direct_sale_invoice_count: number;
      direct_sale_invoice_total: string;
      receipt_count: number;
      receipt_total: string;
    };
    invoice_status: Array<{ status: string; count: number; total: string }>;
    receipt_status: Array<{ status: string; count: number; total: string }>;
    print_status: {
      invoices_printed: number;
      invoices_unprinted: number;
      receipts_printed: number;
      receipts_unprinted: number;
    };
    contract_documents: {
      rent_contract_pdf_count: number;
      lease_contract_pdf_count: number;
      by_verification_status: Array<{ verification_status: string; count: number }>;
    };
  };
  inventory_movement_posture: {
    supported: boolean;
    active_item_count: number;
    tracked_item_count: number;
    movement_summary: {
      count: number;
      quantity_in: string;
      quantity_out: string;
    };
    movement_type: Array<{
      movement_type: string;
      count: number;
      quantity_in: string;
      quantity_out: string;
    }>;
  };
  finance_posture: {
    supported: boolean;
    chart_of_accounts_count: number;
    finance_accounts_count: number;
    purchase_obligations: {
      draft_count: number;
      draft_total: string;
      approved_count: number;
      approved_total: string;
      posted_count: number;
      posted_total: string;
    };
    commission_summary: {
      total_count: number;
      total_commission: string;
      pending_count: number;
      pending_amount: string;
      settled_count: number;
      settled_amount: string;
      reversed_count: number;
      reversed_amount: string;
    };
    payout_batches: {
      total_count: number;
      draft_count: number;
      draft_total: string;
      finalized_count: number;
      finalized_total: string;
      cancelled_count: number;
      cancelled_total: string;
    };
  };
};

export async function getAdminAnalyticsSummary(
  params: AdminAnalyticsSummaryQuery = {}
): Promise<AdminAnalyticsSummaryResponse> {
  return request<AdminAnalyticsSummaryResponse>(
    `/admin/reports/analytics-summary/${buildQuery(params)}`
  );
}

export type MoneyInOutBucket = {
  method: string;
  money_in: string;
  money_out: string;
  net: string;
};

export type MoneyInOutResponse = {
  date_from: string | null;
  date_to: string | null;
  buckets: MoneyInOutBucket[];
  totals: { money_in: string; money_out: string; net: string };
  sources: { money_in: string[]; money_out: string[]; note?: string };
};

export async function getMoneyInOut(params: { date_from?: string; date_to?: string } = {}): Promise<MoneyInOutResponse> {
  return request<MoneyInOutResponse>(`/admin/reports/money-in-out/${buildQuery(params)}`);
}
