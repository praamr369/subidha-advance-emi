export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type PaginationParams = {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
};

export function paginationToParams(
  p: PaginationParams
): Record<string, string | number | boolean | undefined> {
  return {
    page: p.page,
    page_size: p.page_size,
    search: p.search || undefined,
    ordering: p.ordering || undefined,
  };
}
