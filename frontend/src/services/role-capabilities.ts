import { apiFetch } from "@/lib/api";

export type MatrixRole = "ADMIN" | "CASHIER" | "PARTNER" | "CUSTOMER";

export type CapabilityRow = {
  code: string;
  label: string;
  description: string;
};

export type RolePermissionMatrixResponse = {
  capabilities: CapabilityRow[];
  roles: Record<MatrixRole, Record<string, boolean>>;
};

export type UserCapabilityOverrideRow = {
  id: number;
  username: string;
  role: MatrixRole;
  overrides: Record<string, boolean>;
  effective: Record<string, boolean>;
};

export async function getRolePermissionMatrix() {
  return apiFetch<RolePermissionMatrixResponse>("/admin/settings/roles-permissions/");
}

export async function updateRoleCapabilities(
  role: MatrixRole,
  capabilities: Record<string, boolean>
) {
  return apiFetch<{ role: MatrixRole; capabilities: Record<string, boolean> }>(
    `/admin/settings/roles-permissions/roles/${role}/`,
    {
      method: "PATCH",
      body: { capabilities },
    }
  );
}

export async function listUserCapabilityOverrides(q = "") {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
  return apiFetch<{ count: number; results: UserCapabilityOverrideRow[] }>(
    `/admin/settings/roles-permissions/users/${query}`
  );
}

export async function updateUserCapabilityOverrides(
  userId: number,
  overrides: Record<string, boolean>,
  note = ""
) {
  return apiFetch<{
    id: number;
    username: string;
    role: MatrixRole;
    overrides: Record<string, boolean>;
  }>(`/admin/settings/roles-permissions/users/${userId}/`, {
    method: "PATCH",
    body: {
      overrides,
      note,
    },
  });
}
