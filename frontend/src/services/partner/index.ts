import { apiFetch } from "@/lib/api";

export type PartnerDashboardResponse = {
  partner: {
    id: number;
    username: string;
    phone: string;
  };
  summary: {
    total_subscriptions: number;
    active_subscriptions: number;
    completed_subscriptions: number;
    won_subscriptions: number;
    pending_emis: number;
    paid_emis: number;
    total_revenue_collected: number | string;
    total_customers?: number;
    pending_commission?: number | string;
    settled_commission?: number | string;
    defaulted_subscriptions?: number;
    waived_emis?: number;
    total_commission?: number | string;
  };
};

export type PartnerCustomer = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
  created_at?: string;
};

export type PartnerSubscription = {
  id: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  product?: number;
  product_name?: string;
  product_code?: string;
  partner?: number | null;
  partner_name?: string;
  batch?: number | null;
  batch_code?: string | null;
  batch_status?: string;
  lucky_id?: number | null;
  lucky_number?: number | null;
  plan_type?: string;
  tenure_months?: number;
  start_date?: string;
  total_amount?: string;
  monthly_amount?: string;
  status?: string;
  winner_month?: number | null;
  waived_amount?: string;
  created_at?: string;
  emi_count?: number;
  paid_emi_count?: number;
  pending_emi_count?: number;
  waived_emi_count?: number;
};

export type PartnerPayment = {
  id: number;
  customer?: number;
  customer_name?: string;
  customer_phone?: string;
  subscription: number;
  subscription_status?: string;
  emi?: number | null;
  emi_month_no?: number | null;
  batch?: number | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  amount: string;
  method: string;
  reference_no?: string | null;
  payment_date: string;
  collected_by?: number | null;
  collected_by_username?: string | null;
  verified_by?: number | null;
  verified_by_username?: string | null;
  created_at?: string;
};

export type PartnerCommission = {
  id: number;
  subscription?: number | null;
  emi?: number | null;
  partner?: number | null;
  commission_amount: string | number;
  status?: string;
  approved_at?: string | null;
  paid_at?: string | null;
  created_at?: string;
};

export type PartnerCollectedPayment = {
  id?: number;
  payment?: PartnerPayment;
  detail?: string;
  message?: string;
  reference_no?: string | null;
};

export type PartnerEarningsSummary = {
  total_collected: number | string;
  monthly_collection: Array<{
    payment_date__month: number | null;
    total: number | string;
  }>;
};

export type PartnerSubscriptionListResponse = {
  count: number;
  results: PartnerSubscription[];
};

export type PartnerCustomerListResponse = {
  count: number;
  results: PartnerCustomer[];
};

export type PartnerPaymentListResponse = {
  count: number;
  total_collected: number | string;
  results: PartnerPayment[];
};

type LegacyPaginatedResponse<T> = {
  results?: T[];
};

function toArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as LegacyPaginatedResponse<T>).results)
  ) {
    return (payload as LegacyPaginatedResponse<T>).results as T[];
  }
  return [];
}

export async function getPartnerDashboard() {
  return apiFetch<PartnerDashboardResponse>("/partner/dashboard/");
}

export async function listPartnerCustomers(params?: { q?: string }) {
  const search = new URLSearchParams();

  if (params?.q) {
    search.set("q", params.q);
  }

  const query = search.toString();

  return apiFetch<PartnerCustomerListResponse>(
    `/partner/customers/${query ? `?${query}` : ""}`
  );
}

/**
 * Kept only for backward compatibility with older UI code paths.
 * Partner customer creation is not part of the current backend P1 read API.
 */
export async function createPartnerCustomer(_payload: {
  name: string;
  phone: string;
  kyc_status?: string;
}) {
  throw new Error(
    "Partner customer creation is not enabled in the current API. Use admin/customer onboarding flow."
  );
}

export async function listPartnerSubscriptions(params?: { status?: string }) {
  const search = new URLSearchParams();

  if (params?.status) {
    search.set("status", params.status);
  }

  const query = search.toString();

  return apiFetch<PartnerSubscriptionListResponse>(
    `/partner/subscriptions/${query ? `?${query}` : ""}`
  );
}

/**
 * Partner-side collection posting is not part of the current P1 backend contract.
 * Keep this typed stub to avoid unsafe silent misuse while preserving build compatibility.
 */
export async function collectPartnerPayment(_payload: {
  subscription: number;
  amount: string | number;
  payment_mode?: string;
  reference_no?: string;
  paid_at?: string;
}): Promise<PartnerCollectedPayment> {
  throw new Error(
    "Partner payment collection is not enabled in the current API. Use cashier/admin collection workflow."
  );
}

export async function listPartnerCommissions(): Promise<PartnerCommission[]> {
  const payload = await apiFetch<unknown>("/partner/commissions/");
  return toArray<PartnerCommission>(payload);
}

export async function listPartnerPayments(params?: {
  method?: string;
  subscription?: number | string;
}) {
  const search = new URLSearchParams();

  if (params?.method) {
    search.set("method", params.method);
  }

  if (params?.subscription !== undefined && params.subscription !== "") {
    search.set("subscription", String(params.subscription));
  }

  const query = search.toString();

  return apiFetch<PartnerPaymentListResponse>(
    `/partner/payments/${query ? `?${query}` : ""}`
  );
}

export async function getPartnerEarningsSummary() {
  return apiFetch<PartnerEarningsSummary>("/partner/earnings/");
}