import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchCustomers, fetchCustomer } from "./customer.api";
import { customerKeys } from "./customer.keys";
import type { CustomerListParams } from "./customer.types";

export function useCustomers(params: CustomerListParams = {}) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => fetchCustomer(id),
    enabled: id > 0,
  });
}
