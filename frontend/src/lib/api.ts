import { API_BASE_URL } from "@/lib/constants";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";
const ROLE_KEY = "user_role";

function setAccessCookie(token: string): void {
  if (typeof document !== "undefined") {
    document.cookie = `access=${token}; path=/; max-age=86400; samesite=lax`;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const response = await fetch("http://127.0.0.1:8000/api/token/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { access: string };

  localStorage.setItem(ACCESS_KEY, data.access);
  setAccessCookie(data.access);

  return data.access;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  if (typeof window === "undefined") {
    throw new Error("Browser session unavailable");
  }

  const accessToken = localStorage.getItem(ACCESS_KEY);

  const makeRequest = async (token: string | null): Promise<Response> => {
    return fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  };

  let response = await makeRequest(accessToken);

  if (response.status === 401) {
    const newToken = await refreshAccessToken();

    if (!newToken) {
    logout();
    window.location.href = "/login";
    throw new Error("Session expired");
    }

    response = await makeRequest(newToken);
  }

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export function persistSession(
  access: string,
  refresh: string,
  role: string
): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  localStorage.setItem(ROLE_KEY, role.toUpperCase());
  setAccessCookie(access);
}

export function logout(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(ROLE_KEY);

  if (typeof document !== "undefined") {
    document.cookie = "access=; path=/; max-age=0; samesite=lax";
  }
}