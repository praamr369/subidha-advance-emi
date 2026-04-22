import { readStringArray, writeStringArray } from "@/lib/storage";

const FAVORITES_VERSION = 1;
const RECENTS_VERSION = 1;

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

export function writeFavorites(sessionId: number, role: string, values: readonly string[]): void {
  writeStringArray(favoritesKey(sessionId, role), values);
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

export function pushRecent(sessionId: number, role: string, href: string): string[] {
  const trimmed = href.trim();
  if (!trimmed) return readRecents(sessionId, role);

  const current = readRecents(sessionId, role);
  const next = [trimmed, ...current.filter((value) => value !== trimmed)].slice(0, 12);
  writeStringArray(recentsKey(sessionId, role), next);
  return next;
}

