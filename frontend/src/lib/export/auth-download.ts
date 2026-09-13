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
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = API_BASE_URL.replace(/\/+$/, "");
  if (base.endsWith("/api/v1") && normalizedPath.startsWith("/api/v1")) {
    return `${base}${normalizedPath.slice("/api/v1".length) || ""}`;
  }
  return `${base}${normalizedPath}`;
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

async function fetchAuthorized(path: string): Promise<Response> {
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
  return response;
}

type SaveFilePicker = (options?: { suggestedName?: string }) => Promise<FileSystemFileHandle>;

function saveFilePicker(): SaveFilePicker | null {
  if (typeof window === "undefined") return null;
  const picker = (window as unknown as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof picker === "function" ? picker.bind(window) : null;
}

/** True when the browser can ask where to save (Chrome / Edge on desktop). */
export function canChooseSaveLocation(): boolean {
  return saveFilePicker() !== null;
}

/**
 * Ask the user where to save (e.g. an external hard disk), then stream the
 * authenticated download straight into that file so large backups never sit
 * in browser memory. Falls back to a normal browser download when the
 * browser has no save picker. Must be called directly from a click handler:
 * the picker opens before any network await so the user gesture still counts.
 */
export async function saveAuthenticatedFileAs(
  path: string,
  suggestedName: string
): Promise<"saved" | "cancelled"> {
  const picker = saveFilePicker();
  if (!picker) {
    await downloadAuthenticatedFile(path, suggestedName);
    return "saved";
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await picker({ suggestedName });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }

  const response = await fetchAuthorized(path);
  const writable = await handle.createWritable();
  if (response.body) {
    await response.body.pipeTo(writable);
  } else {
    await writable.write(await response.blob());
    await writable.close();
  }
  return "saved";
}

export async function downloadAuthenticatedFile(
  path: string,
  fallbackFilename: string
): Promise<void> {
  const response = await fetchAuthorized(path);
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

export async function openAuthenticatedFile(
  path: string
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
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // We can't immediately revoke the URL because the new tab needs time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
