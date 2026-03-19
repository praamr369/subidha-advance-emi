import { apiFetch } from "@/lib/api";

export type CustomerRecord = {
  id: number;
  user?: number | null;
  user_username?: string;
  name: string;
  phone: string;
  email?: string;
  status?: string;
  kyc_status?: string;
  created_at?: string;
};

type CustomerListResponse =
  | CustomerRecord[]
  | {
      count?: number;
      results?: CustomerRecord[];
    };

function toArray(payload: CustomerListResponse): CustomerRecord[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  return [];
}

function buildQuery(params?: {
  q?: string;
  phone?: string;
  kyc_status?: string;
  page?: number;
}) {
  const search = new URLSearchParams();

  if (params?.q) search.set("q", params.q);
  if (params?.phone) search.set("phone", params.phone);
  if (params?.kyc_status) search.set("kyc_status", params.kyc_status);
  if (params?.page) search.set("page", String(params.page));

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listCustomers(params?: {
  q?: string;
  phone?: string;
  kyc_status?: string;
  page?: number;
}): Promise<CustomerRecord[]> {
  const payload = await apiFetch<CustomerListResponse>(
    `/admin/customers/${buildQuery(params)}`
  );
  return toArray(payload);
}

export async function searchCustomers(query: string): Promise<CustomerRecord[]> {
  return listCustomers({ q: query });
}

export async function getCustomer(
  id: number | string
): Promise<CustomerRecord> {
  return apiFetch<CustomerRecord>(`/admin/customers/${id}/`);
}