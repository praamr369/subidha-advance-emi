import { request } from "@/services/api";

export type CustomerRiskStatus =
  | "GOOD"
  | "DUE"
  | "OVERDUE"
  | "DELIVERY_PENDING"
  | "SERVICE_OPEN";

export type CustomerOperationalSummaryResponse = {
  customer: {
    id: number;
    name: string;
    phone: string;
    kyc_id?: string | null;
    status: string;
  };
  summary: {
    active_subscriptions: number;
    subscription_outstanding: string;
    direct_sale_outstanding: string;
    rent_lease_outstanding: string;
    overdue_emi_count: number;
    pending_delivery_count: number;
    open_service_count: number;
    last_payment_date: string | null;
    risk_status: CustomerRiskStatus;
  };
  subscriptions: Record<string, unknown>[];
  direct_sales: Record<string, unknown>[];
  rent_lease_contracts: Record<string, unknown>[];
  deliveries: Record<string, unknown>[];
  service_tickets: Record<string, unknown>[];
  recent_activity: Record<string, unknown>[];
};

const CACHE_TTL_MS = 45_000;
const cache = new Map<number, { expiresAt: number; data: CustomerOperationalSummaryResponse }>();

export async function getCustomerOperationalSummary(
  customerId: number,
  scope: "admin" | "cashier"
): Promise<CustomerOperationalSummaryResponse> {
  const now = Date.now();
  const cached = cache.get(customerId);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await request<CustomerOperationalSummaryResponse>(
    `/${scope}/customers/${customerId}/operational-summary/`,
    { method: "GET" } as RequestInit
  );
  cache.set(customerId, { expiresAt: now + CACHE_TTL_MS, data });
  return data;
}

export function invalidateCustomerOperationalSummary(customerId: number): void {
  cache.delete(customerId);
}
