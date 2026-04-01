import { API_BASE_URL } from "@/lib/constants";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokens";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type RefreshResponse = {
  access?: string;
  refresh?: string;
};

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers as Record<string, string>;
}

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => null);
}

function resolveErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const candidate = body as {
      detail?: string;
      message?: string;
      error?: string;
      non_field_errors?: string[];
    };

    if (typeof candidate.detail === "string" && candidate.detail.trim()) {
      return candidate.detail;
    }

    if (typeof candidate.message === "string" && candidate.message.trim()) {
      return candidate.message;
    }

    if (typeof candidate.error === "string" && candidate.error.trim()) {
      return candidate.error;
    }

    if (
      Array.isArray(candidate.non_field_errors) &&
      candidate.non_field_errors.length > 0 &&
      typeof candidate.non_field_errors[0] === "string"
    ) {
      return candidate.non_field_errors[0];
    }
  }

  return `Request failed (${status})`;
}

function shouldAttemptRefresh(
  path: string,
  responseStatus: number,
  alreadyRetried: boolean
): boolean {
  if (alreadyRetried) return false;
  if (responseStatus !== 401) return false;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const lower = normalizedPath.toLowerCase();

  if (lower.includes("/auth/login")) return false;
  if (lower.includes("/auth/token/refresh")) return false;

  return true;
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  const lower = key.toLowerCase();
  return Object.keys(headers).some((headerKey) => headerKey.toLowerCase() === lower);
}

function deleteHeader(headers: Record<string, string>, key: string): void {
  const lower = key.toLowerCase();

  for (const headerKey of Object.keys(headers)) {
    if (headerKey.toLowerCase() === lower) {
      delete headers[headerKey];
    }
  }
}

function isFormDataBody(value: unknown): value is FormData {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function isUrlSearchParamsBody(value: unknown): value is URLSearchParams {
  return typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams;
}

function isBlobBody(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function isArrayBufferBody(value: unknown): value is ArrayBuffer {
  return typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer;
}

function isReadableStreamBody(value: unknown): value is ReadableStream {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isBodyInitLike(value: unknown): value is BodyInit {
  if (typeof value === "string") return true;
  if (isFormDataBody(value)) return true;
  if (isUrlSearchParamsBody(value)) return true;
  if (isBlobBody(value)) return true;
  if (isArrayBufferBody(value)) return true;
  if (isReadableStreamBody(value)) return true;

  if (
    typeof value === "object" &&
    value !== null &&
    typeof Uint8Array !== "undefined" &&
    value instanceof Uint8Array
  ) {
    return true;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    typeof DataView !== "undefined" &&
    value instanceof DataView
  ) {
    return true;
  }

  return false;
}

function shouldJsonEncodeBody(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null && !isBodyInitLike(value);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    clearTokens();
    return null;
  }

  const response = await fetch(buildApiUrl("/auth/token/refresh/"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      refresh: refreshToken,
    }),
  });

  const body = (await parseResponseBody(response)) as RefreshResponse | string | null;

  if (!response.ok || !body || typeof body !== "object") {
    clearTokens();
    return null;
  }

  const nextAccessToken =
    typeof body.access === "string" && body.access.trim() ? body.access : null;

  if (!nextAccessToken) {
    clearTokens();
    return null;
  }

  setAccessToken(nextAccessToken);

  if (typeof body.refresh === "string" && body.refresh.trim()) {
    setRefreshToken(body.refresh);
  }

  return nextAccessToken;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  return apiFetchInternal<T>(path, options, token, false);
}

async function apiFetchInternal<T>(
  path: string,
  options: RequestInit,
  token: string | null | undefined,
  alreadyRetried: boolean
): Promise<T> {
  const originalBody = options.body as unknown;

  const headers: Record<string, string> = {
    ...normalizeHeaders(options.headers),
  };

  if (!hasHeader(headers, "Accept")) {
    headers.Accept = "application/json";
  }

  let requestBody: BodyInit | null | undefined = options.body;

  if (isFormDataBody(originalBody)) {
    deleteHeader(headers, "Content-Type");
  } else if (shouldJsonEncodeBody(originalBody)) {
    if (!hasHeader(headers, "Content-Type")) {
      headers["Content-Type"] = "application/json";
    }
    requestBody = JSON.stringify(originalBody);
  } else if (requestBody && !hasHeader(headers, "Content-Type")) {
    // Let fetch/browser handle BodyInit types like Blob, URLSearchParams, etc.
  }

  const accessToken = token ?? getAccessToken();

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(buildApiUrl(path), {
    ...options,
    body: requestBody,
    headers,
  });

  const body = await parseResponseBody(response);

  if (!response.ok) {
    if (shouldAttemptRefresh(path, response.status, alreadyRetried)) {
      const refreshedAccessToken = await refreshAccessToken();

      if (refreshedAccessToken) {
        return apiFetchInternal<T>(
          path,
          {
            ...options,
            headers: normalizeHeaders(options.headers),
          },
          refreshedAccessToken,
          true
        );
      }
    }

    throw new ApiError(
      resolveErrorMessage(body, response.status),
      response.status,
      body
    );
  }

  return body as T;
}

export function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (
    value &&
    typeof value === "object" &&
    "results" in value &&
    Array.isArray((value as { results?: unknown }).results)
  ) {
    return (value as { results: T[] }).results;
  }

  return [];
}