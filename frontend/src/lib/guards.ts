import { getStoredSession } from "@/lib/auth/session";

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

export function hasRole(allowed: string[]): boolean {
  const role = normalize(getStoredSession()?.role || "");
  return allowed.some((value) => normalize(value) === role);
}