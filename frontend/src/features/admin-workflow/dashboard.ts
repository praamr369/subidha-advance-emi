import { request } from "@/services/api";
import {
  adminWorkflowModules,
  defaultWorkflowTasks,
} from "@/features/admin-workflow/config";
import type {
  AdminDashboardApiResponse,
  WorkflowMetric,
  WorkflowModule,
  WorkflowTask,
} from "@/features/admin-workflow/types";

function asNumber(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asMoney(value: number | string | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(asNumber(value));
}

export type AdminWorkflowViewModel = {
  metrics: WorkflowMetric[];
  modules: WorkflowModule[];
  tasks: WorkflowTask[];
  recentPayments: Array<{
    id: number | string;
    title: string;
    description: string;
    amount: string;
  }>;
  overdueAlerts: Array<{
    id: number | string;
    title: string;
    description: string;
    stat: string;
  }>;
  drawItems: Array<{
    id: number | string;
    title: string;
    description: string;
    stat: string;
  }>;
  reconciliationItems: Array<{
    id: number | string;
    title: string;
    description: string;
    stat: string;
  }>;
};

type ReconciliationAttentionItem = {
  id: number;
  customer_name?: string;
  subscription_id?: number;
  amount_due?: number | string;
  status?: string;
};

type BatchListItem = {
  id: number;
};

type BatchListResponse = {
  count?: number;
  results?: BatchListItem[];
};

function toResultsArray<T>(payload: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

export async function fetchAdminWorkflow(): Promise<AdminWorkflowViewModel> {
  const [dashboard, reconciliation, openBatchesPayload] = await Promise.all([
    request<AdminDashboardApiResponse>("/admin/dashboard/"),
    request<ReconciliationAttentionItem[] | { results?: ReconciliationAttentionItem[] }>(
      "/admin/subscriptions/reconciliation-attention/"
    ),
    request<BatchListItem[] | BatchListResponse>("/admin/batches/?status=OPEN"),
  ]);

  const reconItems = Array.isArray(reconciliation)
    ? reconciliation
    : reconciliation.results ?? [];
  const openBatchCount = Array.isArray(openBatchesPayload)
    ? openBatchesPayload.length
    : openBatchesPayload.count ?? toResultsArray(openBatchesPayload).length;

  const payload: AdminDashboardApiResponse = {
    ...dashboard,
    kpis: {
      active_subscriptions: asNumber(dashboard.subscriptions?.active),
      overdue_count: asNumber(dashboard.emi?.overdue),
      open_batches: asNumber(openBatchCount),
      collections_this_month: String(asNumber(dashboard.financial?.today_collection)),
      reconciliation_exceptions: reconItems.length,
    },
    reconciliation_warnings: reconItems.map((item) => ({
      id: item.id,
      issue: item.status || "Needs review",
      subscription_id: item.subscription_id,
      severity: "MEDIUM",
    })),
  };

  const activeSubscriptions =
    payload.kpis?.active_subscriptions ?? payload.subscriptions?.active ?? 0;
  const overdueCount = payload.kpis?.overdue_count ?? payload.emi?.overdue ?? 0;
  const openBatchesMetric =
    payload.kpis?.open_batches ?? payload.batches?.total_batches ?? 0;
  const collectionsThisMonth =
    payload.kpis?.collections_this_month ?? payload.financial?.total_revenue ?? "0";
  const reconciliationExceptions =
    payload.kpis?.reconciliation_exceptions ??
    payload.reconciliation_warnings?.length ??
    0;

  const metrics: WorkflowMetric[] = [
    {
      label: "Active subscriptions",
      value: String(activeSubscriptions),
      tone: "info",
      helpText: "Live contracts under admin control.",
    },
    {
      label: "Overdue EMI",
      value: String(overdueCount),
      tone: asNumber(overdueCount) > 0 ? "warning" : "success",
      helpText: "Accounts requiring collections follow-up.",
    },
    {
      label: "Open batches",
      value: String(openBatchesMetric),
      tone: "default",
      helpText: "Batches still available for allocation.",
    },
    {
      label: "Collections",
      value: asMoney(collectionsThisMonth),
      tone: "success",
      helpText: "Current cycle collections snapshot.",
    },
    {
      label: "Reconciliation exceptions",
      value: String(reconciliationExceptions),
      tone: asNumber(reconciliationExceptions) > 0 ? "danger" : "success",
      helpText: "Data or ledger issues needing closure.",
    },
  ];

  const modules = adminWorkflowModules.map((module) => {
    if (module.id === "subscription-ops") {
      return {
        ...module,
        supportingMetric: `Won: ${payload.subscriptions?.won ?? 0}`,
        primaryMetric: `${activeSubscriptions} active`,
      };
    }

    if (module.id === "collections") {
      return {
        ...module,
        primaryMetric: asMoney(
          payload.financial?.today_collection ?? collectionsThisMonth
        ),
        supportingMetric: `${payload.emi?.pending ?? 0} pending EMI`,
      };
    }

    if (module.id === "batch-governance") {
      return {
        ...module,
        primaryMetric: `${openBatchesMetric} open`,
        supportingMetric: "No scheduled draw",
      };
    }

    if (module.id === "reconciliation") {
      return {
        ...module,
        primaryMetric: `${reconciliationExceptions} open`,
        supportingMetric: `${payload.risk?.high_risk ?? 0} high-risk accounts`,
      };
    }

    if (module.id === "customer-master") {
      return {
        ...module,
        primaryMetric: `${payload.subscriptions?.active ?? 0} active linked`,
        supportingMetric: `${payload.risk?.at_risk ?? 0} at risk`,
      };
    }

    if (module.id === "catalog-control") {
      return {
        ...module,
        primaryMetric: `${payload.batches?.total_draws ?? 0} draws served`,
        supportingMetric: "Import-ready product catalog",
      };
    }

    return module;
  });

  const tasks = defaultWorkflowTasks.map((task) => {
    if (task.id === "review-overdue") {
      return { ...task, stat: `${overdueCount} overdue` };
    }

    if (task.id === "verify-payments") {
      return {
        ...task,
        stat: `${payload.recent_payments?.length ?? 0} recent payments`,
      };
    }

    if (task.id === "prepare-next-draw") {
      return {
        ...task,
        stat: "Pending",
      };
    }

    if (task.id === "inspect-audit") {
      return {
        ...task,
        stat: `${reconciliationExceptions} exceptions`,
      };
    }

    return task;
  });

  return {
    metrics,
    modules,
    tasks,
    recentPayments: (payload.recent_payments ?? []).slice(0, 5).map((item) => ({
      id: item.id,
      title: item.customer_name || `Payment #${item.id}`,
      description: item.payment_date || "Payment date unavailable",
      amount: asMoney(item.amount),
    })),
    overdueAlerts: (payload.overdue_alerts ?? []).slice(0, 5).map((item) => ({
      id: item.id,
      title: item.customer_name || `Overdue alert #${item.id}`,
      description: `Subscription ${item.subscription_id || "-"}`,
      stat:
        item.overdue_months !== undefined
          ? `${item.overdue_months} overdue months`
          : "Needs review",
      amount: item.overdue_amount ? asMoney(item.overdue_amount) : undefined,
    })),
    drawItems: (payload.draw_schedule ?? []).slice(0, 5).map((item) => ({
      id: item.id,
      title: item.batch_code || `Draw #${item.id}`,
      description: item.draw_date || "Draw date unavailable",
      stat: item.status || "Scheduled",
    })),
    reconciliationItems: (payload.reconciliation_warnings ?? [])
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        title: item.issue || `Warning #${item.id}`,
        description: `Subscription ${item.subscription_id || "-"}`,
        stat: item.severity || "Needs review",
      })),
  };
}
