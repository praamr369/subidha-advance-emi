import { readStringArray, writeStringArray } from "@/lib/storage";

const FAVORITES_VERSION = 1;
const RECENTS_VERSION = 1;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function subscribeWorkspacePrefs(listener: () => void) {
  listeners.add(listener);

  if (typeof window !== "undefined") {
    const handleStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("subidha:favorites") || event.key?.startsWith("subidha:recents")) {
        listener();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", handleStorage);
    };
  }

  return () => {
    listeners.delete(listener);
  };
}

function scopedKey(prefix: string, sessionId: number, role: string) {
  return `${prefix}:v${prefix.includes("favorites") ? FAVORITES_VERSION : RECENTS_VERSION}:${sessionId}:${role}`;
}

export function favoritesKey(sessionId: number, role: string) {
  return scopedKey("subidha:favorites", sessionId, role);
}

export function recentsKey(sessionId: number, role: string) {
  return scopedKey("subidha:recents", sessionId, role);
}

export function readFavorites(sessionId: number, role: string): string[] {
  return readStringArray(favoritesKey(sessionId, role));
}

export function readFavoritesSnapshot(sessionId: number, role: string): string {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(favoritesKey(sessionId, role)) ?? "[]";
}

export function writeFavorites(sessionId: number, role: string, values: readonly string[]): void {
  writeStringArray(favoritesKey(sessionId, role), values);
  emitChange();
}

export function toggleFavorite(sessionId: number, role: string, href: string): string[] {
  const trimmed = href.trim();
  if (!trimmed) return readFavorites(sessionId, role);

  const current = readFavorites(sessionId, role);
  const next = current.includes(trimmed) ? current.filter((value) => value !== trimmed) : [trimmed, ...current];
  writeFavorites(sessionId, role, next.slice(0, 24));
  return next;
}

export function readRecents(sessionId: number, role: string): string[] {
  return readStringArray(recentsKey(sessionId, role));
}

export function readRecentsSnapshot(sessionId: number, role: string): string {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(recentsKey(sessionId, role)) ?? "[]";
}

export function pushRecent(sessionId: number, role: string, href: string): string[] {
  const trimmed = href.trim();
  if (!trimmed) return readRecents(sessionId, role);

  const current = readRecents(sessionId, role);
  const next = [trimmed, ...current.filter((value) => value !== trimmed)].slice(0, 12);
  writeStringArray(recentsKey(sessionId, role), next);
  emitChange();
  return next;
}
