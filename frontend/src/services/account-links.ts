import { apiFetch } from "@/lib/api";

export async function getCustomerAccountLink(id: number) {
  return apiFetch(`/admin/customers/${id}/account-link/`);
}

export async function mutateCustomerAccountLink(id: number, payload: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
  return apiFetch(`/admin/customers/${id}/account-link/`, { method, body: JSON.stringify(payload) });
}

export async function getPartnerAccountLink(id: number) {
  return apiFetch(`/admin/partners/${id}/account-link/`);
}

export async function mutatePartnerAccountLink(id: number, payload: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
  return apiFetch(`/admin/partners/${id}/account-link/`, { method, body: JSON.stringify(payload) });
}

export async function getPartyAccountLink(id: number) {
  return apiFetch(`/admin/parties/${id}/account-link/`);
}

export async function mutatePartyAccountLink(id: number, payload: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "PATCH") {
  return apiFetch(`/admin/parties/${id}/account-link/`, { method, body: JSON.stringify(payload) });
}
