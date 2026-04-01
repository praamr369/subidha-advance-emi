import { apiFetch } from "@/lib/api";

export type InternalUserRole = "ADMIN" | "CASHIER" | "PARTNER";

export type InternalUserRecord = {
  id: number;
  username: string;
  phone: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: InternalUserRole;
  commission_rate?: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined?: string;
  last_login?: string | null;
};

export type InternalUserAuditEntry = {
  id: number;
  action_type: string;
  performed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type InternalUserListResponse = {
  count: number;
  results: InternalUserRecord[];
};

export type InternalUserAuditResponse = {
  count: number;
  results: InternalUserAuditEntry[];
};

export type InternalUserListQuery = {
  role?: InternalUserRole | "";
  q?: string;
  is_active?: "true" | "false" | "";
};

export type CreateInternalUserPayload = {
  username: string;
  password: string;
  phone: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role: InternalUserRole;
  commission_rate?: string;
  is_active?: boolean;
};

export type UpdateInternalUserPayload = {
  phone?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: InternalUserRole;
  commission_rate?: string;
  is_active?: boolean;
};

export type ResetInternalUserPasswordPayload = {
  new_password: string;
  confirm_password: string;
};

function buildQuery(params: InternalUserListQuery): string {
  const search = new URLSearchParams();

  if (params.role) search.set("role", params.role);
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.is_active) search.set("is_active", params.is_active);

  const queryString = search.toString();
  return queryString ? `?${queryString}` : "";
}

export async function listInternalUsers(
  query: InternalUserListQuery = {}
): Promise<InternalUserListResponse> {
  return apiFetch<InternalUserListResponse>(
    `/admin/internal-users/${buildQuery(query)}`
  );
}

export async function createInternalUser(
  payload: CreateInternalUserPayload
): Promise<InternalUserRecord> {
  return apiFetch<InternalUserRecord>("/admin/internal-users/create/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInternalUser(
  id: number | string
): Promise<InternalUserRecord> {
  return apiFetch<InternalUserRecord>(`/admin/internal-users/${id}/`);
}

export async function updateInternalUser(
  id: number | string,
  payload: UpdateInternalUserPayload
): Promise<InternalUserRecord> {
  return apiFetch<InternalUserRecord>(`/admin/internal-users/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function activateInternalUser(
  id: number | string
): Promise<InternalUserRecord> {
  return apiFetch<InternalUserRecord>(`/admin/internal-users/${id}/activate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deactivateInternalUser(
  id: number | string
): Promise<InternalUserRecord> {
  return apiFetch<InternalUserRecord>(`/admin/internal-users/${id}/deactivate/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function resetInternalUserPassword(
  id: number | string,
  payload: ResetInternalUserPasswordPayload
): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/admin/internal-users/${id}/reset-password/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getInternalUserAudit(
  id: number | string
): Promise<InternalUserAuditResponse> {
  return apiFetch<InternalUserAuditResponse>(`/admin/internal-users/${id}/audit/`);
}
