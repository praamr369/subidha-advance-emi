import { useQuery } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query-keys";
import { getPriorityAlerts } from "@/services/dashboard.service";

export function usePriorityAlerts() {
  return useQuery({
    queryKey: dashboardKeys.priorityAlerts(),
    queryFn: getPriorityAlerts,
  });
}