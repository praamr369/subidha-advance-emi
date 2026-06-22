import type { PaginationParams } from "@/shared/api/pagination";

export const customerKeys = {
  all: ["customers"] as const,
  lists: () => [...customerKeys.all, "list"] as const,
  list: (params: PaginationParams) =>
    [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, "detail"] as const,
  detail: (id: number) => [...customerKeys.details(), id] as const,
};
