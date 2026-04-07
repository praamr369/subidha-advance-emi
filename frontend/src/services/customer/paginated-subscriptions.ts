import { apiFetch } from "@/lib/api";
import {
  normalizeCustomerSubscription,
  type CustomerSubscription,
} from "@/services/customer";

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

function normalizePaginatedResponse<T>(
  payload: unknown,
  normalizeItem?: (item: unknown) => T
): PaginatedListResponse<T> {
  const root = (payload ?? {}) as Record<string, unknown>;
  return {
    count: toNumber(root.count, 0),
    results: Array.isArray(root.results)
      ? normalizeItem
        ? root.results.map(normalizeItem)
        : (root.results as T[])
      : [],
    page: toNumber(root.page, 1),
    page_size: toNumber(root.page_size, 25),
    num_pages: toNumber(root.num_pages, 0),
    has_next: toBoolean(root.has_next),
    has_previous: toBoolean(root.has_previous),
  };
}

export type CustomerSubscriptionRegisterResponse = PaginatedListResponse<CustomerSubscription>;

export async function listCustomerSubscriptionsRegister(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerSubscriptionRegisterResponse> {
  const query = buildQuery({
    status: params?.status,
    page: params?.page,
    page_size: params?.pageSize,
  });

  const payload = await apiFetch<unknown>(`/customer/subscriptions/${query}`);
  return normalizePaginatedResponse<CustomerSubscription>(
    payload,
    normalizeCustomerSubscription
  );
}
