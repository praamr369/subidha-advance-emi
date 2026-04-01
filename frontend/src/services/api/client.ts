import { apiFetch } from "@/lib/api";
import { normalizeApiError } from "@/services/api/errors";
import type { ApiRequestOptions } from "@/services/api/types";

function withTimeoutSignal(signal: AbortSignal | null | undefined, timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Request timeout"), timeoutMs);

  const clear = (): void => clearTimeout(timeout);
  controller.signal.addEventListener("abort", clear, { once: true });

  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      clear();
    } else {
      signal.addEventListener(
        "abort",
        () => {
          controller.abort(signal.reason);
          clear();
        },
        { once: true },
      );
    }
  }

  return controller.signal;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /timeout|network|failed to fetch/i.test(error.message);
}

export async function apiClient<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { timeoutMs = 10000, retryCount = 1, signal, ...init } = options;

  try {
    const timeoutSignal = withTimeoutSignal(signal, timeoutMs);
    return (await apiFetch(path, { ...init, signal: timeoutSignal })) as T;
  } catch (error) {
    if (retryCount > 0 && isRetryableError(error)) {
      return apiClient<T>(path, { ...options, retryCount: retryCount - 1 });
    }
    throw normalizeApiError(error);
  }
}
