import { apiFetch } from "@/lib/api";

export type DashboardSummary = {
  pendingEmisCount: number;
  overdueEmisCount: number;
  todayCollectionAmount: number;
  activeSubscriptionsCount: number;
  totalSubscriptionsCount: number;
  reconciliationAttentionCount: number;
};

export type DashboardQueueItem = {
  id: number;
  emi_id?: number | null;
  subscription_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  amount_due?: number | string | null;
  due_date?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  status?: string | null;
};

export type PriorityAlert = {
  id: string;
  title: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
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

type ReconciliationAttentionItem = {
  id: number;
  customer_name?: string;
  customer_phone?: string;
  subscription_id?: number;
  emi_id?: number;
  amount_due?: number | string;
  due_date?: string;
  batch_code?: string;
  lucky_number?: number;
  status?: string;
};

type CommissionSummaryResponse = {
  summary?: {
    total_commission?: string;
    pending_commission?: string;
    settled_commission?: string;
    reversed_commission?: string;
    total_count?: number;
    pending_count?: number;
    settled_count?: number;
    reversed_count?: number;
  };
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getSubscriptionKpis(): Promise<SubscriptionKpisResponse> {
  return apiFetch<SubscriptionKpisResponse>("/admin/subscriptions/kpis/");
}

async function getReconciliationAttention(): Promise<ReconciliationAttentionItem[]> {
  const payload = await apiFetch<
    ReconciliationAttentionItem[] | { results?: ReconciliationAttentionItem[] }
  >("/admin/subscriptions/reconciliation-attention/");

  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

async function getCommissionSummary(): Promise<CommissionSummaryResponse> {
  return apiFetch<CommissionSummaryResponse>("/admin/commissions/summary/");
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const kpis = await getSubscriptionKpis();

  return {
    pendingEmisCount: toNumber(kpis.pending_emis),
    overdueEmisCount: toNumber(kpis.overdue_emis),
    todayCollectionAmount: toNumber(kpis.today_collection),
    activeSubscriptionsCount: toNumber(kpis.active_subscriptions),
    totalSubscriptionsCount: toNumber(kpis.total_subscriptions),
    reconciliationAttentionCount: toNumber(kpis.reconciliation_attention_count),
  };
}

export async function getTodayQueue(): Promise<DashboardQueueItem[]> {
  const items = await getReconciliationAttention();

  return items.map((item) => ({
    id: item.id,
    emi_id: item.emi_id ?? null,
    subscription_id: item.subscription_id ?? null,
    customer_name: item.customer_name ?? null,
    customer_phone: item.customer_phone ?? null,
    amount_due: item.amount_due ?? null,
    due_date: item.due_date ?? null,
    batch_code: item.batch_code ?? null,
    lucky_number: item.lucky_number ?? null,
    status: item.status ?? null,
  }));
}

export async function getPriorityAlerts(): Promise<PriorityAlert[]> {
  const [kpis, queueItems, commissionSummary] = await Promise.all([
    getSubscriptionKpis(),
    getReconciliationAttention(),
    getCommissionSummary(),
  ]);

  const alerts: PriorityAlert[] = [];

  const overdueEmis = toNumber(kpis.overdue_emis);
  const reconciliationAttention = toNumber(kpis.reconciliation_attention_count);
  const pendingCommissionCount = toNumber(commissionSummary.summary?.pending_count);

  if (overdueEmis > 0) {
    alerts.push({
      id: "overdue-emis",
      title: "Overdue Advance EMI follow-up required",
      description: `${overdueEmis} advance EMI records are overdue and need collection action.`,
      severity: overdueEmis >= 25 ? "CRITICAL" : overdueEmis >= 10 ? "HIGH" : "MEDIUM",
    });
  }

  if (reconciliationAttention > 0) {
    alerts.push({
      id: "reconciliation-attention",
      title: "Reconciliation attention required",
      description: `${reconciliationAttention} subscriptions need reconciliation review.`,
      severity:
        reconciliationAttention >= 20
          ? "HIGH"
          : reconciliationAttention >= 5
          ? "MEDIUM"
          : "LOW",
    });
  }

  if (pendingCommissionCount > 0) {
    alerts.push({
      id: "pending-commissions",
      title: "Pending commission workload",
      description: `${pendingCommissionCount} commission records are still pending settlement.`,
      severity:
        pendingCommissionCount >= 25
          ? "HIGH"
          : pendingCommissionCount >= 10
          ? "MEDIUM"
          : "LOW",
    });
  }

  if (alerts.length === 0 && queueItems.length === 0) {
    alerts.push({
      id: "system-clear",
      title: "No immediate operational alerts",
      description: "Collections, reconciliation, and commission signals are currently stable.",
      severity: "LOW",
    });
  }

  return alerts;
}
