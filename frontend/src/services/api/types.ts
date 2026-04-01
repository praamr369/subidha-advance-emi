export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  retryCount?: number;
};

export type ApiPaginatedResponse<T> = {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: T[];
};
