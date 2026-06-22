import { API_BASE_URL } from "@/app/env";
import { tokenStore } from "@/shared/auth/token-store";
import { ApiError } from "./api-error";

type RequestOptions = {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
};

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`, window.location.origin);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function refreshAndRetry(
  url: string,
  init: RequestInit
): Promise<Response> {
  const refresh = tokenStore.getRefreshToken();
  if (!refresh) throw new ApiError("Session expired", 401);

  const refreshRes = await fetch(
    `${API_BASE_URL.replace(/\/+$/, "")}/auth/refresh/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    }
  );

  if (!refreshRes.ok) {
    tokenStore.clear();
    throw new ApiError("Session expired", 401);
  }

  const { access } = (await refreshRes.json()) as { access: string };
  tokenStore.setTokens(access, refresh);

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("Authorization", `Bearer ${access}`);

  return fetch(url, { ...init, headers: retryHeaders });
}

export async function http<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, params, headers = {} } = options;
  const url = buildUrl(path, params);

  const token = tokenStore.getAccessToken();
  const init: RequestInit = {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  let res = await fetch(url, init);

  if (res.status === 401 && token) {
    res = await refreshAndRetry(url, init);
  }

  if (res.status === 204) return undefined as T;

  const ct = res.headers.get("content-type") ?? "";
  const data = ct.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as Record<string, unknown>).detail)
        : typeof data === "string"
          ? data
          : "Request failed";
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, params?: RequestOptions["params"]) =>
    http<T>(path, { params }),

  post: <T>(path: string, body?: unknown) =>
    http<T>(path, { method: "POST", body }),

  put: <T>(path: string, body?: unknown) =>
    http<T>(path, { method: "PUT", body }),

  patch: <T>(path: string, body?: unknown) =>
    http<T>(path, { method: "PATCH", body }),

  delete: <T>(path: string) => http<T>(path, { method: "DELETE" }),
};
