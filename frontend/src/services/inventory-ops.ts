import { request } from "@/services/api";

export async function getInventoryReadiness() {
  return request("/admin/inventory/readiness/");
}

export async function listStockNeeds(params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  const suffix = qs ? `?${qs}` : "";
  return request(`/admin/inventory/stock-needs/${suffix}`);
}

export async function createStockNeed(payload: Record<string, unknown>) {
  return request("/admin/inventory/stock-needs/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchStockNeed(id: number, payload: Record<string, unknown>) {
  return request(`/admin/inventory/stock-needs/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function recheckStockNeed(id: number) {
  return request(`/admin/inventory/stock-needs/${id}/recheck/`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
