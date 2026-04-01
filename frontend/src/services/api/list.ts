import type { ApiPaginatedResponse } from "@/services/api/types";

export function toResultsArray<T>(payload: ApiPaginatedResponse<T> | T[] | unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (payload && typeof payload === "object" && Array.isArray((payload as ApiPaginatedResponse<T>).results)) {
    return ((payload as ApiPaginatedResponse<T>).results ?? []) as T[];
  }

  return [];
}

export function toPaginated<T>(payload: ApiPaginatedResponse<T> | T[] | unknown): ApiPaginatedResponse<T> {
  if (Array.isArray(payload)) {
    return { count: payload.length, next: null, previous: null, results: payload as T[] };
  }

  if (payload && typeof payload === "object") {
    const page = payload as ApiPaginatedResponse<T>;
    return {
      count: page.count ?? page.results?.length ?? 0,
      next: page.next ?? null,
      previous: page.previous ?? null,
      results: page.results ?? [],
    };
  }

  return { count: 0, next: null, previous: null, results: [] };
}
