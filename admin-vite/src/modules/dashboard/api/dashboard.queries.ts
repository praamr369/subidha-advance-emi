import { useQuery } from "@tanstack/react-query";
import { fetchAdminDashboard } from "./dashboard.api";
import { dashboardKeys } from "./dashboard.keys";

export function useAdminDashboard() {
  return useQuery({
    queryKey: dashboardKeys.admin(),
    queryFn: fetchAdminDashboard,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
