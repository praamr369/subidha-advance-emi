import { request } from "@/services/api";

export type CustomerRiskStatus =
  | "GOOD"
  | "ACTIVE"
  | "DUE"
  | "OVERDUE"
  | "HISTORY"
  | "CANCELLED"
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
    cancelled_subscription_count?: number;
    historical_subscriptions?: number;
    active_contract_value?: string;
    historical_contract_value?: string;
    subscription_outstanding: string;
    active_subscription_due?: string;
    direct_sale_outstanding: string;
    returned_direct_sale_count?: number;
    rent_lease_outstanding: string;
    overdue_emi_count: number;
    active_overdue_emi_count?: number;
    active_overdue_emi_amount?: string;
    pending_delivery_count: number;
    open_service_count: number;
    last_payment_date: string | null;
    active_payment_count?: number;
    reversed_payment_count?: number;
    active_collected_amount?: string;
    reversed_payment_amount?: string;
    has_history_only_contracts?: boolean;
    history_badges?: string[];
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
