import { useQuery } from "@tanstack/react-query";
import type { PaginationParams } from "@/shared/api/pagination";
import { fetchCustomers, fetchCustomer } from "./customer.api";
import { customerKeys } from "./customer.keys";

export function useCustomers(params: PaginationParams = {}) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: () => fetchCustomers(params),
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: () => fetchCustomer(id),
    enabled: id > 0,
  });
}
