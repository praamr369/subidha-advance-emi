import { useQuery } from "@tanstack/react-query";
import { getTodayQueue } from "@/services/dashboard.service";

export function useTodayQueue() {
  return useQuery({
    queryKey: ["dashboard-today-queue"],
    queryFn: getTodayQueue,
  });
}