import { useQuery } from "@tanstack/react-query";
import { getDueTodayCollections } from "@/services/collections.service";

export function useDueTodayCollections() {
  return useQuery({
    queryKey: ["collections-due-today"],
    queryFn: getDueTodayCollections,
  });
}