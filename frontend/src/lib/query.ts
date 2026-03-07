export type PageParams = {
  page: number;
  pageSize: number;
  sort?: string;
  filters?: Record<string, string | number | boolean | undefined>;
};

export type PaginatedResult<T> = {
  results: T[];
  count: number;
  next?: string | null;
  prev?: string | null;
};

export type FieldErrors = Record<string, string[]>;

export type ApiErrorShape = {
  message: string;
  field_errors?: FieldErrors;
};
