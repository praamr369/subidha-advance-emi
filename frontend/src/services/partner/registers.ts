import { apiFetch } from "@/lib/api";
import type { PartnerCustomer, PartnerSubscription } from "@/services/partner";

type PaginatedListResponse<T> = {
  count: number;
  results: T[];
  page: number;
  page_size: number;
  num_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function buildQuery(
  params: Record<string, string | number | undefined | null>
): string {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : "";
}

function normalizePaginatedResponse<T>(payload: unknown): PaginatedListResponse<T> {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    results: Array.isArray(root.results) ? (root.results as T[]) : [],
    page: toNumber(root.page, 1),
    page_size: toNumber(root.page_size, 25),
    num_pages: toNumber(root.num_pages, 0),
    has_next: toBoolean(root.has_next),
    has_previous: toBoolean(root.has_previous),
  };
}

export type PartnerSubscriptionRegisterResponse = PaginatedListResponse<PartnerSubscription>;
export type PartnerCustomerRegisterResponse = PaginatedListResponse<PartnerCustomer>;

export async function listPartnerSubscriptionsRegister(params?: {
  status?: string;
  customer?: number | string;
  product?: number | string;
  batch?: number | string;
  planType?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<PartnerSubscriptionRegisterResponse> {
  const query = buildQuery({
    status: params?.status,
    customer: params?.customer,
    product: params?.product,
    batch: params?.batch,
    plan_type: params?.planType,
    q: params?.q,
    page: params?.page,
    page_size: params?.pageSize,
  });

  const payload = await apiFetch<unknown>(`/partner/subscriptions/${query}`);
  return normalizePaginatedResponse<PartnerSubscription>(payload);
}

export async function listPartnerCustomersRegister(params?: {
  q?: string;
  kycStatus?: string;
  page?: number;
  pageSize?: number;
}): Promise<PartnerCustomerRegisterResponse> {
  const query = buildQuery({
    q: params?.q,
    kyc_status: params?.kycStatus,
    page: params?.page,
    page_size: params?.pageSize,
  });

  const payload = await apiFetch<unknown>(`/partner/customers/${query}`);
  return normalizePaginatedResponse<PartnerCustomer>(payload);
}
