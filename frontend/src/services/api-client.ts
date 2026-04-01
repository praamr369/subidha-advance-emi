import { ApiError, apiFetch } from "@/lib/api";
import { clearSession } from "@/lib/auth/session";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokens";
import { refreshTokenRequest } from "@/services/auth.service";

export async function authFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const accessToken = getAccessToken();

  try {
    return await apiFetch<T>(path, options, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      clearSession();
      throw error;
    }

    try {
      const refreshed = await refreshTokenRequest(refreshToken);

      if (!refreshed.access || !refreshed.access.trim()) {
        clearSession();
        throw new Error("Token refresh failed.");
      }

      setAccessToken(refreshed.access);

      if (typeof refreshed.refresh === "string" && refreshed.refresh.trim()) {
        setRefreshToken(refreshed.refresh);
      }

      return await apiFetch<T>(path, options, refreshed.access);
    } catch (refreshError) {
      clearSession();
      throw refreshError;
    }
  }
}