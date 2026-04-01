import { useQuery } from "@tanstack/react-query";
import { getOverdueCollections } from "@/services/collections.service";

export function useOverdueCollections() {
  return useQuery({
    queryKey: ["collections-overdue"],
    queryFn: getOverdueCollections,
  });
}