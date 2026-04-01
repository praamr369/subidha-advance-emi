import { apiFetch } from "@/lib/api";

export type AdminDashboardResponse = {
  financial: {
    total_revenue: number | string;
    today_collection: number | string;
    total_outstanding: number | string;
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
  batches: {
    total_batches: number;
    total_draws: number;
  };
  risk: {
    healthy: number;
    at_risk: number;
    high_risk: number;
    defaulted: number;
    default_rate: number;
  };
  financial_health: Record<string, unknown>;
};

type AdminDashboardPayload = {
  financial?: {
    total_revenue?: number | string;
    today_collection?: number | string;
    total_outstanding?: number | string;
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
  risk?: {
    healthy?: number;
    at_risk?: number;
    high_risk?: number;
    defaulted?: number;
    default_rate?: number;
  };
  financial_health?: Record<string, unknown>;
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

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  const [dashboard, commissions] = await Promise.all([
    apiFetch<AdminDashboardPayload>("/admin/dashboard/"),
    apiFetch<CommissionSummaryResponse>("/admin/commissions/summary/"),
  ]);

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
    risk: {
      healthy: toNumber(dashboard.risk?.healthy),
      at_risk: toNumber(dashboard.risk?.at_risk),
      high_risk: toNumber(dashboard.risk?.high_risk),
      defaulted: toNumber(dashboard.risk?.defaulted),
      default_rate: toNumber(dashboard.risk?.default_rate),
    },
    financial_health: {
      ...(dashboard.financial_health ?? {}),
      commission_summary: commissions.summary ?? {},
    },
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
