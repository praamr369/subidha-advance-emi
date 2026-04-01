import { apiClient } from "@/services/api/client";
import { normalizeApiError } from "@/services/api/errors";
import type { ApiRequestOptions } from "@/services/api/types";

export type ApiErrorShape = {
  message: string;
  status?: number;
  details?: unknown;
};

export async function request<T>(path: string, init: ApiRequestOptions = {}, retryCount = 1): Promise<T> {
  return apiClient<T>(path, { ...init, retryCount });
}

export { normalizeApiError };
