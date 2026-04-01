import { useQuery } from "@tanstack/react-query";
import { getPriorityAlerts } from "@/services/dashboard.service";

export function usePriorityAlerts() {
  return useQuery({
    queryKey: ["dashboard-priority-alerts"],
    queryFn: getPriorityAlerts,
  });
}