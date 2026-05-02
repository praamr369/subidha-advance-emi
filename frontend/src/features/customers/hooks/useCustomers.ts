import { useQuery } from "@tanstack/react-query";

import { customerKeys } from "@/lib/query-keys";
import { listCustomers } from "@/services/customers";

export function useCustomers() {
  return useQuery({
    queryKey: customerKeys.list(),
    queryFn: () => listCustomers(),
  });
}