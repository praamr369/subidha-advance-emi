import { API_BASE_URL } from "@/lib/constants";
import { clearSession, getStoredSession } from "@/lib/auth/session";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokens";
import { refreshTokenRequest } from "@/services/auth.service";

export class ApiError extends Error {
  status: number;
  body: unknown;
  readableMessage: string;
  fieldErrors: Record<string, string[]>;
  rawBodyPreview: string;

  constructor(
    message: string,
    status: number,
    body: unknown = null,
    fieldErrors: Record<string, string[]> = {},
    rawBodyPreview = ""
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.readableMessage = message;
    this.fieldErrors = fieldErrors;
    this.rawBodyPreview = rawBodyPreview;
  }
}

export type ApiFetchBody =
  | BodyInit
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

export type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  headers?: HeadersInit;
  body?: ApiFetchBody;
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

function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = API_BASE_URL.replace(/\/+$/, "");
  // `API_BASE_URL` is normalized to end with `/api/v1` (see `lib/env.ts`). Many
  // call sites still pass absolute API paths like `/api/v1/...`; concatenating
  // blindly would produce `/api/v1/api/v1/...` and break requests at runtime.
  if (base.endsWith("/api/v1") && normalizedPath.startsWith("/api/v1")) {
    return `${base}${normalizedPath.slice("/api/v1".length) || ""}`;
  }
  return `${base}${normalizedPath}`;
}

function buildPaymentCollectionIdempotencyKey(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) return `client-payment:${randomUUID}`;
  return `client-payment:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function isPaymentCollectionMutation(path: string, method: string | undefined): boolean {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedMethod = (method || "GET").toUpperCase();
  if (normalizedMethod !== "POST") return false;
  return (
    normalizedPath.endsWith("/admin/payments/collect/") ||
    normalizedPath.endsWith("/cashier/collect-payment/")
  );
}

function withPaymentCollectionIdempotency(
  path: string,
  method: string | undefined,
  body: ApiFetchBody
): ApiFetchBody {
  if (!isPaymentCollectionMutation(path, method)) return body;
  if (body == null) return body;

  if (typeof body === "string" && looksLikeJsonString(body)) {
    try {
      const parsed = JSON.parse(body) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        if (typeof record.idempotency_key === "string" && record.idempotency_key.trim()) {
          return body;
        }
        return JSON.stringify({
          ...record,
          idempotency_key: buildPaymentCollectionIdempotencyKey(),
        });
      }
    } catch {
      return body;
    }
  }

  if (typeof body === "object" && body !== null && !isBodyInitLike(body) && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (typeof record.idempotency_key === "string" && record.idempotency_key.trim()) {
      return body;
    }
    return {
      ...record,
      idempotency_key: buildPaymentCollectionIdempotencyKey(),
    };
  }

  return body;
}

type ParsedResponseBody = {
  body: unknown;
  rawText: string;
};

function trimBodyPreview(value: string): string {
  return value.slice(0, 500);
}

function appendFieldError(
  target: Record<string, string[]>,
  key: string,
  message: string
): void {
  const normalizedKey = key.trim() || "non_field_errors";
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;
  if (!target[normalizedKey]) target[normalizedKey] = [];
  if (!target[normalizedKey].includes(normalizedMessage)) {
    target[normalizedKey].push(normalizedMessage);
  }
}

function collectFieldErrors(
  value: unknown,
  target: Record<string, string[]>,
  prefix = ""
): void {
  if (typeof value === "string") {
    appendFieldError(target, prefix || "non_field_errors", value);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectFieldErrors(entry, target, prefix));
    return;
  }

  if (!value || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  Object.entries(record).forEach(([key, entry]) => {
    if (key === "status") return;
    const nextPrefix = key === "non_field_errors" ? (prefix || key) : prefix ? `${prefix}.${key}` : key;
    collectFieldErrors(entry, target, nextPrefix);
  });
}

function flattenFieldErrors(body: unknown): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  collectFieldErrors(body, fieldErrors);
  return fieldErrors;
}

function firstFieldError(fieldErrors: Record<string, string[]>): string | null {
  for (const [field, values] of Object.entries(fieldErrors)) {
    const first = values.find((value) => value.trim().length > 0);
    if (!first) continue;
    if (field === "non_field_errors") return first;
    return `${field}: ${first}`;
  }
  return null;
}

async function parseResponseBody(response: Response): Promise<ParsedResponseBody> {
  const rawText = await response.text().catch(() => "");
  if (!rawText.trim()) return { body: null, rawText: "" };

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json") || looksLikeJsonString(rawText)) {
    try {
      return { body: JSON.parse(rawText), rawText };
    } catch {
      return { body: rawText, rawText };
    }
  }

  return { body: rawText, rawText };
}

function resolveErrorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (body && typeof body === "object") {
    const candidate = body as Record<string, unknown>;

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

    for (const [field, value] of Object.entries(candidate)) {
      if (Array.isArray(value) && value.length > 0) {
        return `${field}: ${String(value[0])}`;
      }

      if (typeof value === "string" && value.trim()) {
        return `${field}: ${value}`;
      }
    }

    try {
      return JSON.stringify(candidate);
    } catch {
      return `Request failed (${status})`;
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
  if (lower.includes("/auth/refresh")) return false;
  if (lower.includes("/auth/logout")) return false;

  return true;
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

function looksLikeJsonString(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken =
    getRefreshToken() ?? getStoredSession()?.refreshToken ?? null;

  if (!refreshToken) {
    clearSession();
    return null;
  }

  try {
    const body = await refreshTokenRequest(refreshToken);

    const nextAccessToken =
      typeof body.access === "string" && body.access.trim()
        ? body.access
        : null;

    if (!nextAccessToken) {
      clearSession();
      return null;
    }

    setAccessToken(nextAccessToken);

    if (typeof body.refresh === "string" && body.refresh.trim()) {
      setRefreshToken(body.refresh);
    }

    return nextAccessToken;
  } catch {
    clearSession();
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
  token?: string | null
): Promise<T> {
  return apiFetchInternal<T>(path, options, token, false);
}

async function apiFetchInternal<T>(
  path: string,
  options: ApiFetchOptions,
  token: string | null | undefined,
  alreadyRetried: boolean
): Promise<T> {
  const originalBody = withPaymentCollectionIdempotency(
    path,
    options.method,
    options.body
  );

  const headers: Record<string, string> = {
    ...normalizeHeaders(options.headers),
  };

  if (!hasHeader(headers, "Accept")) {
    headers.Accept = "application/json";
  }

  let requestBody: BodyInit | null | undefined = undefined;

  if (originalBody == null) {
    requestBody = undefined;
  } else if (isFormDataBody(originalBody)) {
    deleteHeader(headers, "Content-Type");
    requestBody = originalBody;
  } else if (shouldJsonEncodeBody(originalBody)) {
    if (!hasHeader(headers, "Content-Type")) {
      headers["Content-Type"] = "application/json";
    }
    requestBody = JSON.stringify(originalBody);
  } else if (typeof originalBody === "string") {
    if (!hasHeader(headers, "Content-Type") && looksLikeJsonString(originalBody)) {
      headers["Content-Type"] = "application/json";
    }
    requestBody = originalBody;
  } else {
    requestBody = originalBody as BodyInit;
  }

  const accessToken =
    token ?? getAccessToken() ?? getStoredSession()?.accessToken ?? null;

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      body: requestBody,
      headers,
    });
  } catch (error) {
    throw error;
  }

  const parsed = await parseResponseBody(response);
  const body = parsed.body;

  if (!response.ok) {
    if (shouldAttemptRefresh(path, response.status, alreadyRetried)) {
      const refreshedAccessToken = await refreshAccessToken();

      if (refreshedAccessToken) {
        return apiFetchInternal<T>(
          path,
          {
            ...options,
            body: originalBody,
            headers: normalizeHeaders(options.headers),
          },
          refreshedAccessToken,
          true
        );
      }
    }

    const fieldErrors = flattenFieldErrors(body);
    const readableMessage =
      resolveErrorMessage(body, response.status) ||
      firstFieldError(fieldErrors) ||
      `Request failed (${response.status})`;

    throw new ApiError(
      readableMessage,
      response.status,
      body,
      fieldErrors,
      trimBodyPreview(parsed.rawText)
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
