export type PaginatedResponse<T> = { count: number; next: string | null; previous: string | null; results: T[] };
export type ApiErrorShape = { detail?: string; [key: string]: unknown };
export type HealthResponse = { ok: boolean; service: string; timestamp: string; version: string };
