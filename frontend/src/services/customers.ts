import { request } from "@/services/api";

export type CustomerRecord = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
  status?: string;
  address?: string;
  city?: string;
  email?: string;
  user_username?: string;
  active_subscription_count?: number;
  total_subscription_value?: string;
  created_at?: string;
  user?: number | null;
  // Phase 1 additive fields
  customer_source?: string;
  customer_code?: string;
  profile_photo_url?: string | null;
};

export type CustomerSearchResult = CustomerRecord & {
  /** True when the result was returned as an exact phone match. */
  exact_match?: boolean;
};

export type CustomerQuickCreatePayload = {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  source?: "ADMIN" | "PARTNER" | "PUBLIC" | "IMPORT";
};

export type CustomerQuickCreateResponse = {
  created: boolean;
  detail: string;
  customer: CustomerRecord;
};

type PaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};

function toArray<T>(
  payload: T[] | PaginatedResponse<T> | null | undefined
): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function normalizeCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: Number(row.id ?? 0),
    name: typeof row.name === "string" ? row.name : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    kyc_status:
      typeof row.kyc_status === "string" ? row.kyc_status : undefined,
    status: typeof row.status === "string" ? row.status : undefined,
    address: typeof row.address === "string" ? row.address : undefined,
    city: typeof row.city === "string" ? row.city : undefined,
    email: typeof row.email === "string" ? row.email : undefined,
    user_username:
      typeof row.user_username === "string" ? row.user_username : undefined,
    active_subscription_count:
      typeof row.active_subscription_count === "number"
        ? row.active_subscription_count
        : undefined,
    total_subscription_value:
      typeof row.total_subscription_value === "string"
        ? row.total_subscription_value
        : undefined,
    created_at:
      typeof row.created_at === "string" ? row.created_at : undefined,
    user:
      typeof row.user === "number"
        ? row.user
        : row.user === null
          ? null
          : undefined,
  };
}

function buildCustomerQuery(params?: {
  q?: string;
  page?: number;
}) {
  const search = new URLSearchParams();

  if (params?.q) search.set("q", params.q);
  if (params?.page) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCustomers(params?: {
  q?: string;
  page?: number;
}): Promise<{
  count: number;
  next: string | null;
  previous: string | null;
  results: CustomerRecord[];
}> {
  const payload = await request<PaginatedResponse<Record<string, unknown>>>(
    `/admin/customers/${buildCustomerQuery(params)}`,
    {
      method: "GET",
    } as RequestInit
  );

  const rows = toArray(payload).map(normalizeCustomer);

  return {
    count: Number(payload?.count ?? rows.length),
    next: payload?.next ?? null,
    previous: payload?.previous ?? null,
    results: rows,
  };
}

export async function searchCustomers(q: string): Promise<CustomerRecord[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const payload = await request<
    Record<string, unknown>[] | PaginatedResponse<Record<string, unknown>>
  >(`/admin/customers/search/?q=${encodeURIComponent(trimmed)}`, {
    method: "GET",
  } as RequestInit);

  return toArray(payload).map(normalizeCustomer);
}

export async function getCustomer(
  id: number | string
): Promise<CustomerRecord> {
  const payload = await request<Record<string, unknown>>(
    `/admin/customers/${id}/`,
    {
      method: "GET",
    } as RequestInit
  );

  return normalizeCustomer(payload ?? {});
}

// ---------------------------------------------------------------------------
// Phase 1: Phone-first search (shared endpoint for admin + partner)
// ---------------------------------------------------------------------------

export async function searchByPhone(phone: string): Promise<{
  exact_match: boolean;
  count: number;
  results: CustomerRecord[];
}> {
  const trimmed = phone.trim();
  if (!trimmed) return { exact_match: false, count: 0, results: [] };

  const payload = await request<{
    exact_match?: boolean;
    count?: number;
    results?: Record<string, unknown>[];
  }>(`/customers/search/?phone=${encodeURIComponent(trimmed)}`, {
    method: "GET",
  } as RequestInit);

  const results = (payload?.results ?? []).map(normalizeCustomer);
  return {
    exact_match: Boolean(payload?.exact_match),
    count: Number(payload?.count ?? results.length),
    results,
  };
}

export async function searchCustomersShared(q: string): Promise<{
  exact_match: boolean;
  count: number;
  results: CustomerRecord[];
}> {
  const trimmed = q.trim();
  if (!trimmed) return { exact_match: false, count: 0, results: [] };

  const payload = await request<{
    exact_match?: boolean;
    count?: number;
    results?: Record<string, unknown>[];
  }>(`/customers/search/?q=${encodeURIComponent(trimmed)}`, {
    method: "GET",
  } as RequestInit);

  const results = (payload?.results ?? []).map(normalizeCustomer);
  return {
    exact_match: Boolean(payload?.exact_match),
    count: Number(payload?.count ?? results.length),
    results,
  };
}

// ---------------------------------------------------------------------------
// Phase 1: Quick-create (email optional)
// ---------------------------------------------------------------------------

export async function createCustomerQuick(
  payload: CustomerQuickCreatePayload
): Promise<CustomerQuickCreateResponse> {
  const response = await request<{
    created?: boolean;
    detail?: string;
    customer?: Record<string, unknown>;
  }>("/customers/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  } as RequestInit);

  return {
    created: Boolean(response?.created),
    detail: typeof response?.detail === "string" ? response.detail : "",
    customer: normalizeCustomer(response?.customer ?? {}),
  };
}

// ---------------------------------------------------------------------------
// Phase 1: Customer profile summary (admin)
// ---------------------------------------------------------------------------

export async function getCustomerProfileSummary(
  id: number | string
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/customers/${id}/profile-summary/`,
    {
      method: "GET",
    } as RequestInit
  );
}
