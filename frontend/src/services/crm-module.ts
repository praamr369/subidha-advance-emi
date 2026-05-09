import { request } from "@/services/api";

export async function getInternalCrmLeads(query = "") {
  return request(`/admin/crm/internal/leads/${query ? `?${query}` : ""}`);
}

export async function getInternalCrmFollowUps() {
  return request(`/admin/crm/internal/follow-ups/`);
}

export async function getInternalCustomerCrmProfile(customerId: number) {
  return request(`/admin/crm/internal/customers/${customerId}/profile/`);
}

