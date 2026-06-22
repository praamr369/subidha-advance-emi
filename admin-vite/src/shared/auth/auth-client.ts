import { API_BASE_URL } from "@/app/env";
import { tokenStore } from "./token-store";

export type LoginPayload = {
  identifier: string;
  password: string;
};

export type LoginResult = {
  access: string;
  refresh: string;
  user?: {
    id?: number;
    username?: string;
    name?: string;
    role?: string;
  };
};

export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  role: string;
  is_staff: boolean;
  is_superuser: boolean;
  customer_profile_id: number | null;
};

function url(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, "")}${path}`;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  const ct = res.headers.get("content-type") ?? "";
  const body = ct.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    if (typeof body === "object" && body !== null) {
      const detail = (body as Record<string, unknown>).detail;
      if (typeof detail === "string") throw new Error(detail);
    }
    throw new Error(typeof body === "string" ? body : "Request failed");
  }
  return body as T;
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  const res = await fetch(url("/auth/login/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseOrThrow<LoginResult>(res);
}

export async function refreshToken(): Promise<{ access: string }> {
  const refresh = tokenStore.getRefreshToken();
  const res = await fetch(url("/auth/refresh/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });
  return parseOrThrow<{ access: string }>(res);
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const token = tokenStore.getAccessToken();
  const res = await fetch(url("/auth/me/"), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    try {
      const refreshed = await refreshToken();
      tokenStore.setTokens(
        refreshed.access,
        tokenStore.getRefreshToken() ?? ""
      );
      const retry = await fetch(url("/auth/me/"), {
        headers: { Authorization: `Bearer ${refreshed.access}` },
      });
      return parseOrThrow<CurrentUser>(retry);
    } catch {
      tokenStore.clear();
      throw new Error("Session expired");
    }
  }

  return parseOrThrow<CurrentUser>(res);
}

export async function logout(): Promise<void> {
  const refresh = tokenStore.getRefreshToken();
  try {
    await fetch(url("/auth/logout/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
  } finally {
    tokenStore.clear();
  }
}
