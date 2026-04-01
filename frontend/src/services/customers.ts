import { request } from "@/services/api";

export type CustomerRecord = {
  id: number;
  name: string;
  phone: string;
  kyc_status?: string;
  address?: string;
  created_at?: string;
  user?: number | null;
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
    address: typeof row.address === "string" ? row.address : undefined,
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