import { api } from "@/shared/api/http-client";
import { endpoints } from "@/shared/api/endpoints";
import type { PaginatedResponse } from "@/shared/api/pagination";
import type {
  CustomerAdmin,
  CustomerCreatePayload,
  CustomerUpdatePayload,
  CustomerListParams,
  KycDecisionPayload,
  KycDecisionResponse,
} from "./customer.types";

function listParamsToQuery(
  params: CustomerListParams,
): Record<string, string | number | undefined> {
  return {
    page: params.page,
    page_size: params.page_size,
    search: params.search || undefined,
    kyc_status: params.kyc_status || undefined,
    status: params.status || undefined,
  };
}

export function fetchCustomers(params: CustomerListParams) {
  return api.get<PaginatedResponse<CustomerAdmin>>(
    endpoints.customers.list,
    listParamsToQuery(params),
  );
}

export function fetchCustomer(id: number) {
  return api.get<CustomerAdmin>(endpoints.customers.detail(id));
}

export function createCustomer(data: CustomerCreatePayload) {
  return api.post<CustomerAdmin>(endpoints.customers.list, data);
}

export function updateCustomer(id: number, data: CustomerUpdatePayload) {
  return api.patch<CustomerAdmin>(endpoints.customers.detail(id), data);
}

export function deleteCustomer(id: number) {
  return api.delete(endpoints.customers.detail(id));
}

export function submitKycDecision(id: number, data: KycDecisionPayload) {
  return api.post<KycDecisionResponse>(
    endpoints.customers.kycDecision(id),
    data,
  );
}
