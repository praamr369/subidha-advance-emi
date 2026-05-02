import { useQuery } from "@tanstack/react-query";
import { collectionsKeys } from "@/lib/query-keys";
import { getDueTodayCollections } from "@/services/collections.service";

export function useDueTodayCollections() {
  return useQuery({
    queryKey: collectionsKeys.dueToday(),
    queryFn: getDueTodayCollections,
  });
}