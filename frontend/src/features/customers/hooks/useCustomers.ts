import { useQuery } from "@tanstack/react-query";

import { listCustomers } from "@/services/customers";

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers(),
  });
}