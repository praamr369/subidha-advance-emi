import { useQuery } from "@tanstack/react-query";
import { collectionsKeys } from "@/lib/query-keys";
import { getOverdueCollections } from "@/services/collections.service";

export function useOverdueCollections() {
  return useQuery({
    queryKey: collectionsKeys.overdue(),
    queryFn: getOverdueCollections,
  });
}