import { useQuery } from "@tanstack/react-query";
import { getRecentCollections } from "@/services/collections.service";

export function useRecentCollections() {
  return useQuery({
    queryKey: ["collections-recent"],
    queryFn: getRecentCollections,
  });
}