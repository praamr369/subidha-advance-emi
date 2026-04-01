import type { UserRole } from "@/types/common";

export function hasRole(user: { role: UserRole } | null | undefined, role: UserRole) { return user?.role === role; }
export function hasAnyRole(user: { role: UserRole } | null | undefined, roles: UserRole[]) { return !!user && roles.includes(user.role); }
