import { apiFetch } from "@/lib/api";

export async function getVendorAccountLink(vendorId: number) {
  return apiFetch(`/admin/vendors/${vendorId}/account-link/`);
}

export async function linkVendorAccount(vendorId: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/vendors/${vendorId}/account-link/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function changeVendorAccount(vendorId: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/vendors/${vendorId}/account-link/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function unlinkVendorAccount(vendorId: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/vendors/${vendorId}/account-link/`, {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}
