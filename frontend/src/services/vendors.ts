import { apiFetch } from "@/lib/api";

export type VendorStatus = "ACTIVE" | "ON_HOLD" | "BLOCKED" | "ARCHIVED";

export type VendorCategory = {
  id: number;
  name: string;
  code: string;
  description?: string;
  parent?: number | null;
  is_active: boolean;
};

export type Vendor = {
  id: number;
  vendor_code: string;
  name: string;
  display_name: string;
  legal_name?: string;
  contact_person?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  gstin?: string | null;
  pan?: string;
  state_code?: string | null;
  state_name?: string | null;
  status: VendorStatus;
  payment_terms?: string;
  credit_period_days: number;
  quality_score?: string;
  delivery_score?: string;
  warranty_score?: string;
  price_score?: string;
  rating?: string;
  notes?: string;
  linked_user?: number | null;
  is_active: boolean;
  categories: number[];
  addresses?: Array<Record<string, unknown>>;
  service_areas?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  created_at?: string;
  updated_at?: string;
};

export type VendorWritePayload = {
  vendor_code?: string;
  name: string;
  display_name?: string;
  legal_name?: string;
  contact_person?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  gstin?: string;
  pan?: string;
  state_code?: string;
  state_name?: string;
  status: VendorStatus;
  payment_terms?: string;
  credit_period_days?: number;
  notes?: string;
  is_active: boolean;
  categories?: number[];
};

export type VendorListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Vendor[];
};

function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export async function listVendors(
  params: Record<string, string | number | boolean | undefined | null> = {}
) {
  return apiFetch<VendorListResponse | Vendor[]>(
    `/admin/vendors/${buildQuery({ page_size: 200, ordering: "name,id", ...params })}`
  );
}

export async function createVendor(payload: VendorWritePayload) {
  return apiFetch<Vendor>("/admin/vendors/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getVendor(id: number) {
  return apiFetch<Vendor>(`/admin/vendors/${id}/`);
}

export async function updateVendor(id: number, payload: Partial<VendorWritePayload>) {
  return apiFetch<Vendor>(`/admin/vendors/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listVendorCategories() {
  return apiFetch<VendorCategory[] | { results?: VendorCategory[] }>("/admin/vendors/categories/");
}

export async function createVendorCategory(payload: {
  name: string;
  code: string;
  description?: string;
  parent?: number | null;
  is_active?: boolean;
}) {
  return apiFetch<VendorCategory>("/admin/vendors/categories/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateVendorCategory(
  id: number,
  payload: Partial<{
    name: string;
    code: string;
    description: string;
    parent: number | null;
    is_active: boolean;
  }>
) {
  return apiFetch<VendorCategory>(`/admin/vendors/categories/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
