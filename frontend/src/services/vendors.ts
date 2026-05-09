import { apiFetch } from "@/lib/api";

export async function listVendors() {
  return apiFetch("/admin/vendors/");
}

export async function createVendor(payload: Record<string, unknown>) {
  return apiFetch("/admin/vendors/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getVendor(id: number) {
  return apiFetch(`/admin/vendors/${id}/`);
}

export async function updateVendor(id: number, payload: Record<string, unknown>) {
  return apiFetch(`/admin/vendors/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listVendorCategories() {
  return apiFetch("/admin/vendors/categories/");
}

export async function createVendorCategory(payload: Record<string, unknown>) {
  return apiFetch("/admin/vendors/categories/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
