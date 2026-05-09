import { useQuery } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query-keys";
import { getDashboardSummary } from "@/services/dashboard.service";

export function useDashboardSummary() {
  return useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: getDashboardSummary,
  });
}