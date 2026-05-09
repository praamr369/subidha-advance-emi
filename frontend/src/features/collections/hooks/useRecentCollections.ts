import { useQuery } from "@tanstack/react-query";
import { collectionsKeys } from "@/lib/query-keys";
import { getRecentCollections } from "@/services/collections.service";

export function useRecentCollections() {
  return useQuery({
    queryKey: collectionsKeys.recent(),
    queryFn: getRecentCollections,
  });
}