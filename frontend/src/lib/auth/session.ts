import { SESSION_KEY } from "@/lib/constants";
import {
  clearTokens,
  setAccessToken,
  setRefreshToken,
} from "@/lib/auth/tokens";

export type StoredSession = {
  id: number;
  name: string;
  role: string;
  accessToken: string;
  refreshToken: string;
};

const AUTH_ROLE_COOKIE = "subidha_role";
const AUTH_PRESENT_COOKIE = "subidha_auth";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function setCookie(name: string, value: string, maxAgeSeconds = 60 * 60 * 24 * 7) {
  if (!isBrowser()) return;

  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

function clearCookie(name: string) {
  if (!isBrowser()) return;

  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function syncAuthCookies(session: StoredSession | null) {
  if (!isBrowser()) return;

  if (!session) {
    clearCookie(AUTH_ROLE_COOKIE);
    clearCookie(AUTH_PRESENT_COOKIE);
    return;
  }

  setCookie(AUTH_ROLE_COOKIE, (session.role || "").toUpperCase());
  setCookie(AUTH_PRESENT_COOKIE, "1");
}

function normalizeStoredSession(value: unknown): StoredSession | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;

  const id = Number(candidate.id);
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const role = typeof candidate.role === "string" ? candidate.role : "";
  const accessToken =
    typeof candidate.accessToken === "string" ? candidate.accessToken : "";
  const refreshToken =
    typeof candidate.refreshToken === "string" ? candidate.refreshToken : "";

  if (!Number.isFinite(id)) return null;
  if (!name.trim()) return null;
  if (!role.trim()) return null;
  if (!accessToken.trim()) return null;
  if (!refreshToken.trim()) return null;

  return {
    id,
    name,
    role,
    accessToken,
    refreshToken,
  };
}

export function getSession(): StoredSession | null {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    return normalizeStoredSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function getStoredSession(): StoredSession | null {
  return getSession();
}

export function setSession(session: StoredSession): void {
  if (!isBrowser()) return;

  const normalized = normalizeStoredSession(session);
  if (!normalized) return;

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
  setAccessToken(normalized.accessToken);
  setRefreshToken(normalized.refreshToken);
  syncAuthCookies(normalized);
}

export function storeSession(session: StoredSession): void {
  setSession(session);
}

export function clearSession(): void {
  if (!isBrowser()) return;

  window.localStorage.removeItem(SESSION_KEY);
  clearTokens();
  syncAuthCookies(null);
}

export function getAccessToken(): string | null {
  return getSession()?.accessToken ?? null;
}

export function getRefreshToken(): string | null {
  return getSession()?.refreshToken ?? null;
}

export function getRole(): string | null {
  return getSession()?.role ?? null;
}