import { getRole } from "@/lib/auth";

export function hasRole(allowed: string[]): boolean {
  const role = (getRole() || "").toUpperCase();
  return allowed.map((r) => r.toUpperCase()).includes(role);
}
