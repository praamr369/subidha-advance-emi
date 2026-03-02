import type { UserRole } from "@/types/user";

const ROLE_HIERARCHY: Readonly<Record<UserRole, number>> = {
  customer: 1,
  partner: 2,
  admin: 3,
};

export function hasRequiredRole(userRole: UserRole, minimumRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}
