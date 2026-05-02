import { useQuery } from "@tanstack/react-query";
import { dashboardKeys } from "@/lib/query-keys";
import { getTodayQueue } from "@/services/dashboard.service";

export function useTodayQueue() {
  return useQuery({
    queryKey: dashboardKeys.todayQueue(),
    queryFn: getTodayQueue,
  });
}