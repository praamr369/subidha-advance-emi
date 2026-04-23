import { apiFetch } from "@/lib/api";

export type AdminLeadStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "CONTACTED"
  | "CONVERTED"
  | "CLOSED";

export type AdminLeadIntent =
  | "GENERAL"
  | "QUOTATION"
  | "ESTIMATE"
  | "DIRECT_SALE"
  | "SUBSCRIPTION";

export type AdminLeadRow = {
  id: number;
  name: string;
  phone: string;
  city?: string;
  product_id?: number | null;
  product_name?: string | null;
  product_code?: string | null;
  product_base_price?: string | null;
  interested_product?: string;
  preferred_emi_amount?: string | null;
  status: AdminLeadStatus;
  intent?: AdminLeadIntent;
  source?: string;
  follow_up_required?: boolean;
  follow_up_on?: string | null;
  follow_up_note?: string;
  assigned_to_id?: number | null;
  assigned_to_username?: string | null;
  assigned_to_role?: string | null;
  assigned_to_full_name?: string | null;
  assigned_at?: string | null;
  contacted_at?: string | null;
  converted_customer_id?: number | null;
  converted_customer_name?: string | null;
  converted_customer_phone?: string | null;
  converted_subscription_id?: number | null;
  converted_subscription_number?: string | null;
  converted_direct_sale_id?: number | null;
  converted_direct_sale_no?: string | null;
  converted_by_id?: number | null;
  converted_by_username?: string | null;
  converted_by_full_name?: string | null;
  party_id?: number | null;
  party_no?: string | null;
  party_display_name?: string | null;
  next_follow_up_at?: string | null;
  follow_up_state?: "NONE" | "DUE" | "SCHEDULED";
  open_follow_up_count?: number;
  converted_at?: string | null;
  closed_at?: string | null;
  created_at?: string | null;
};

export type AdminLeadDetail = AdminLeadRow & {
  submitted_notes?: string;
  admin_notes?: string;
};

export type AdminLeadSummary = {
  total: number;
  new: number;
  in_progress: number;
  contacted: number;
  converted: number;
  closed: number;
  assigned: number;
  unassigned: number;
};

export type AdminLeadListResponse = {
  count: number;
  summary: AdminLeadSummary;
  results: AdminLeadRow[];
};

export type AdminLeadListQuery = {
  q?: string;
  status?: AdminLeadStatus | "";
  intent?: AdminLeadIntent | "";
  assignee?: string;
  date_from?: string;
  date_to?: string;
};

function buildQuery(params: AdminLeadListQuery): string {
  const search = new URLSearchParams();

  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.status) search.set("status", params.status);
  if (params.intent) search.set("intent", params.intent);
  if (params.assignee?.trim()) search.set("assignee", params.assignee.trim());
  if (params.date_from?.trim()) search.set("date_from", params.date_from.trim());
  if (params.date_to?.trim()) search.set("date_to", params.date_to.trim());

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listAdminLeads(
  query: AdminLeadListQuery = {}
): Promise<AdminLeadListResponse> {
  return apiFetch<AdminLeadListResponse>(`/admin/leads/${buildQuery(query)}`);
}

export async function createAdminLead(payload: {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  product_id?: number | null;
  interested_product?: string;
  preferred_emi_amount?: string;
  notes?: string;
  admin_notes?: string;
  source?: string;
  intent?: AdminLeadIntent;
  follow_up_required?: boolean;
  follow_up_on?: string | null;
  follow_up_note?: string;
  assigned_to?: number | null;
}): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>("/admin/leads/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAdminLead(id: number | string): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>(`/admin/leads/${id}/`);
}

export async function updateAdminLeadStatus(
  id: number | string,
  status: AdminLeadStatus
): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>(`/admin/leads/${id}/status/`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export async function updateAdminLeadAssignee(
  id: number | string,
  assigned_to: number | null
): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>(`/admin/leads/${id}/assign/`, {
    method: "POST",
    body: JSON.stringify({ assigned_to }),
  });
}

export async function updateAdminLeadNotes(
  id: number | string,
  payload: {
    note: string;
    mode: "append" | "replace";
  }
): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>(`/admin/leads/${id}/notes/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function completeAdminLeadConversion(
  id: number | string,
  payload: {
    customer_id?: number | null;
    subscription_id?: number | null;
    direct_sale_id?: number | null;
  }
): Promise<AdminLeadDetail> {
  return apiFetch<AdminLeadDetail>(`/admin/leads/${id}/convert/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
