import { apiFetch } from "@/lib/api";

export type AdminSupportRequestStatus = "SUBMITTED" | "UNDER_REVIEW" | "CLOSED";

export type AdminSupportRequest = {
  id: number;
  customer?: number | null;
  customer_name?: string;
  customer_phone?: string;
  payment?: number | null;
  payment_reference_no?: string | null;
  payment_amount?: string | null;
  payment_method?: string | null;
  payment_date?: string | null;
  subscription?: number | null;
  subscription_number?: string | null;
  category: string;
  message: string;
  status: AdminSupportRequestStatus;
  assigned_to_id?: number | null;
  assigned_to_username?: string | null;
  assigned_to_full_name?: string | null;
  assigned_at?: string | null;
  resolved_by_id?: number | null;
  resolved_by_username?: string | null;
  resolved_by_full_name?: string | null;
  resolved_at?: string | null;
  resolution_summary?: string;
  internal_notes?: string;
  created_at?: string;
  updated_at?: string;
};

export type AdminSupportRequestListResponse = {
  count: number;
  summary: {
    total: number;
    submitted: number;
    under_review: number;
    closed: number;
    assigned: number;
    unassigned: number;
  };
  results: AdminSupportRequest[];
};

export type AdminSupportRequestListQuery = {
  q?: string;
  status?: AdminSupportRequestStatus | "";
  category?: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function toMoneyString(value: unknown, fallback = "0.00"): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : fallback;
  }

  return fallback;
}

function normalizeAdminSupportRequest(item: unknown): AdminSupportRequest {
  const row = (item ?? {}) as Record<string, unknown>;

  return {
    id: toNumber(row.id),
    customer:
      row.customer === null || row.customer === undefined
        ? null
        : toNumber(row.customer),
    customer_name: toStringOrUndefined(row.customer_name),
    customer_phone: toStringOrUndefined(row.customer_phone),
    payment:
      row.payment === null || row.payment === undefined
        ? null
        : toNumber(row.payment),
    payment_reference_no: toStringOrUndefined(row.payment_reference_no) ?? null,
    payment_amount:
      row.payment_amount === null || row.payment_amount === undefined
        ? null
        : toMoneyString(row.payment_amount),
    payment_method: toStringOrUndefined(row.payment_method) ?? null,
    payment_date: toStringOrUndefined(row.payment_date) ?? null,
    subscription:
      row.subscription === null || row.subscription === undefined
        ? null
        : toNumber(row.subscription),
    subscription_number: toStringOrUndefined(row.subscription_number) ?? null,
    category: toStringOrUndefined(row.category) ?? "OTHER",
    message: toStringOrUndefined(row.message) ?? "",
    status:
      (toStringOrUndefined(row.status) as AdminSupportRequestStatus | undefined) ??
      "SUBMITTED",
    assigned_to_id:
      row.assigned_to_id === null || row.assigned_to_id === undefined
        ? null
        : toNumber(row.assigned_to_id),
    assigned_to_username: toStringOrUndefined(row.assigned_to_username) ?? null,
    assigned_to_full_name: toStringOrUndefined(row.assigned_to_full_name) ?? null,
    assigned_at: toStringOrUndefined(row.assigned_at) ?? null,
    resolved_by_id:
      row.resolved_by_id === null || row.resolved_by_id === undefined
        ? null
        : toNumber(row.resolved_by_id),
    resolved_by_username: toStringOrUndefined(row.resolved_by_username) ?? null,
    resolved_by_full_name: toStringOrUndefined(row.resolved_by_full_name) ?? null,
    resolved_at: toStringOrUndefined(row.resolved_at) ?? null,
    resolution_summary: toStringOrUndefined(row.resolution_summary) ?? "",
    internal_notes: toStringOrUndefined(row.internal_notes) ?? "",
    created_at: toStringOrUndefined(row.created_at),
    updated_at: toStringOrUndefined(row.updated_at),
  };
}

function buildQuery(params: AdminSupportRequestListQuery = {}): string {
  const search = new URLSearchParams();

  if (params?.q) {
    search.set("q", params.q);
  }

  if (params?.status) {
    search.set("status", params.status);
  }

  if (params?.category) {
    search.set("category", params.category);
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

export async function listAdminSupportRequests(
  params: AdminSupportRequestListQuery = {}
): Promise<AdminSupportRequestListResponse> {
  const payload = await apiFetch<unknown>(
    `/admin/support-requests/${buildQuery(params)}`
  );
  const root = (payload ?? {}) as Record<string, unknown>;
  const summary = (root.summary ?? {}) as Record<string, unknown>;
  const results = Array.isArray(root.results) ? root.results : [];

  return {
    count: toNumber(root.count, 0),
    summary: {
      total: toNumber(summary.total, 0),
      submitted: toNumber(summary.submitted, 0),
      under_review: toNumber(summary.under_review, 0),
      closed: toNumber(summary.closed, 0),
      assigned: toNumber(summary.assigned, 0),
      unassigned: toNumber(summary.unassigned, 0),
    },
    results: results.map(normalizeAdminSupportRequest),
  };
}

export async function getAdminSupportRequest(
  id: number | string
): Promise<AdminSupportRequest> {
  const payload = await apiFetch<unknown>(`/admin/support-requests/${id}/`);
  return normalizeAdminSupportRequest(payload);
}

export async function updateAdminSupportRequestStatus(
  id: number | string,
  status: AdminSupportRequestStatus
): Promise<AdminSupportRequest> {
  const payload = await apiFetch<unknown>(`/admin/support-requests/${id}/status/`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
  return normalizeAdminSupportRequest(payload);
}

export async function updateAdminSupportRequestAssignee(
  id: number | string,
  assigned_to: number | null
): Promise<AdminSupportRequest> {
  const payload = await apiFetch<unknown>(`/admin/support-requests/${id}/assign/`, {
    method: "POST",
    body: JSON.stringify({ assigned_to }),
  });
  return normalizeAdminSupportRequest(payload);
}

export async function updateAdminSupportRequestNotes(
  id: number | string,
  payload: {
    note: string;
    mode: "append" | "replace";
  }
): Promise<AdminSupportRequest> {
  const response = await apiFetch<unknown>(`/admin/support-requests/${id}/notes/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeAdminSupportRequest(response);
}

export async function resolveAdminSupportRequest(
  id: number | string,
  payload: {
    resolution_summary: string;
  }
): Promise<AdminSupportRequest> {
  const response = await apiFetch<unknown>(`/admin/support-requests/${id}/resolve/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeAdminSupportRequest(response);
}
