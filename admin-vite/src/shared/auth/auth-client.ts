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
    id: number;
    username: string;
    email: string;
    phone: string;
    first_name: string;
    last_name: string;
    role: string;
    staff_profile_id: number | null;
    display_name: string;
    is_active: boolean;
    is_staff: boolean;
    is_superuser: boolean;
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
  const identifier = payload.identifier.trim();
  const body = { identifier, password: payload.password };

  const res = await fetch(url("/auth/login/"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) return parseOrThrow<LoginResult>(res);

  // Backward compat: older deployments may only accept { username, password }.
  const ct = res.headers.get("content-type") ?? "";
  const errBody = ct.includes("application/json") ? await res.json() : null;

  const isShapeError =
    res.status === 400 &&
    errBody &&
    typeof errBody === "object" &&
    ("username" in errBody || "identifier" in errBody);

  if (isShapeError) {
    const fallback = await fetch(url("/auth/login/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: identifier, password: payload.password }),
    });
    return parseOrThrow<LoginResult>(fallback);
  }

  // Re-throw the original error
  if (typeof errBody === "object" && errBody !== null) {
    const detail = (errBody as Record<string, unknown>).detail;
    if (typeof detail === "string") throw new Error(detail);
  }
  throw new Error("Login failed");
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
