// src/lib/api.ts
import { API_BASE_URL, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from "@/lib/constants";

const ROLE_KEY = "user_role"; // keep existing key to avoid touching many files

function setAccessCookie(token: string): void {
  if (typeof document === "undefined") return;
  // 15 minutes cookie for middleware protection
  document.cookie = `access=${token}; path=/; max-age=900; samesite=lax`;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

function buildRefreshUrl(): string {
  // matches your login style: `${API_BASE_URL}/auth/login/`
  return `${API_BASE_URL}/auth/refresh/`;
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refresh) return null;

  const res = await fetch(buildRefreshUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as { access: string };
  if (!data?.access) return null;

  localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
  setAccessCookie(data.access);

  return data.access;
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  if (typeof window === "undefined") {
    throw new Error("Browser session unavailable");
  }

  const makeRequest = async (token: string | null): Promise<Response> => {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

    const headers: Record<string, string> = {
      ...normalizeHeaders(options.headers),
    };

    // Don’t set JSON content-type for FormData
    if (!isFormData && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  };

  const access = localStorage.getItem(ACCESS_TOKEN_KEY);
  let res = await makeRequest(access);

  if (res.status === 401) {
    const newAccess = await refreshAccessToken();

    if (!newAccess) {
      logout();
      window.location.href = "/login";
      throw new Error("Session expired");
    }

    res = await makeRequest(newAccess);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed (${res.status})`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}

export function persistSession(access: string, refresh: string, role: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  localStorage.setItem(ROLE_KEY, role.toUpperCase());
  setAccessCookie(access);
}

export function logout(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);

  if (typeof document !== "undefined") {
    document.cookie = "access=; path=/; max-age=0; samesite=lax";
  }
}

type PaginatedResponse<T> = { results?: T[] };

export function toArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && Array.isArray((payload as PaginatedResponse<T>).results)) {
    return (payload as PaginatedResponse<T>).results as T[];
  }
  return [];
}