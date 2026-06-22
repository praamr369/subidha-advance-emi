import { api } from "@/shared/api/http-client";
import { endpoints } from "@/shared/api/endpoints";
import {
  type PaginatedResponse,
  type PaginationParams,
  paginationToParams,
} from "@/shared/api/pagination";

export type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  created_at: string;
};

export function fetchCustomers(params: PaginationParams) {
  return api.get<PaginatedResponse<Customer>>(
    endpoints.customers.list,
    paginationToParams(params)
  );
}

export function fetchCustomer(id: number) {
  return api.get<Customer>(endpoints.customers.detail(id));
}

export function createCustomer(data: Omit<Customer, "id" | "created_at">) {
  return api.post<Customer>(endpoints.customers.list, data);
}

export function updateCustomer(
  id: number,
  data: Partial<Omit<Customer, "id" | "created_at">>
) {
  return api.patch<Customer>(endpoints.customers.detail(id), data);
}

export function deleteCustomer(id: number) {
  return api.delete(endpoints.customers.detail(id));
}
