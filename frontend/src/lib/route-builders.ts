import { ROUTES } from "@/lib/routes";

export type AdminReconciliationView = "subscriptions" | "payments";

type AdminReconciliationRouteParams = {
  view?: AdminReconciliationView;
  subscription?: number | string | null;
  payment?: number | string | null;
  status?: string | null;
  flagged?: boolean | string | null;
  locked?: boolean | string | null;
  q?: string | null;
};

function appendQueryValue(
  search: URLSearchParams,
  key: string,
  value: string | number | boolean | null | undefined
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string" && !value.trim()) {
    return;
  }

  search.set(key, String(value));
}

export function buildAdminReconciliationRoute(
  params: AdminReconciliationRouteParams = {}
): string {
  const search = new URLSearchParams();

  if (params.view === "payments") {
    search.set("view", "payments");
  }

  appendQueryValue(search, "subscription", params.subscription);
  appendQueryValue(search, "payment", params.payment);
  appendQueryValue(search, "status", params.status);
  appendQueryValue(search, "flagged", params.flagged);
  appendQueryValue(search, "locked", params.locked);
  appendQueryValue(search, "q", params.q);

  const query = search.toString();
  return query ? `${ROUTES.admin.reconciliation}?${query}` : ROUTES.admin.reconciliation;
}

export function buildAdminSubscriptionRoute(id: number | string): string {
  return `${ROUTES.admin.subscriptions}/${id}`;
}

export function buildAdminPaymentRoute(id: number | string): string {
  return `${ROUTES.admin.payments}/${id}`;
}

export function buildAdminCustomerRoute(id: number | string): string {
  return `${ROUTES.admin.customers}/${id}`;
}

export function buildAdminBatchRoute(id: number | string): string {
  return `${ROUTES.admin.batches}/${id}`;
}

export function buildAdminLuckyIdRoute(id: number | string): string {
  return `${ROUTES.admin.luckyIds}/${id}`;
}

export function buildAdminDeliveryRoute(id: number | string): string {
  return `${ROUTES.admin.deliveries}/${id}`;
}
