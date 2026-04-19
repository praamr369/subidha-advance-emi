import { API_BASE_URL } from "@/lib/constants";
import { clearSession, getStoredSession } from "@/lib/auth/session";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokens";
import { refreshTokenRequest } from "@/services/auth.service";

function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function resolveFilename(
  headerValue: string | null,
  fallback: string
): string {
  if (!headerValue) return fallback;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = headerValue.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] || fallback;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken() ?? getStoredSession()?.refreshToken ?? null;
  if (!refreshToken) {
    clearSession();
    return null;
  }

  try {
    const body = await refreshTokenRequest(refreshToken);
    if (!body.access?.trim()) {
      clearSession();
      return null;
    }

    setAccessToken(body.access);
    if (typeof body.refresh === "string" && body.refresh.trim()) {
      setRefreshToken(body.refresh);
    }

    return body.access;
  } catch {
    clearSession();
    return null;
  }
}

async function fetchDownload(
  path: string,
  token: string | null | undefined
): Promise<Response> {
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(buildApiUrl(path), {
    method: "GET",
    headers,
  });
}

async function resolveError(response: Response): Promise<Error> {
  const body = await response.text().catch(() => "");
  return new Error(body || `Download failed (${response.status})`);
}

export async function downloadAuthenticatedFile(
  path: string,
  fallbackFilename: string
): Promise<void> {
  let response = await fetchDownload(path, getAccessToken());

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      throw new Error("Authentication expired.");
    }
    response = await fetchDownload(path, refreshed);
  }

  if (!response.ok) {
    throw await resolveError(response);
  }

  const blob = await response.blob();
  const filename = resolveFilename(
    response.headers.get("content-disposition"),
    fallbackFilename
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
