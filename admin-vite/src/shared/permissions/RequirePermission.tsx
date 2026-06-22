import { type ReactNode } from "react";
import { useCurrentUser } from "@/shared/auth/useCurrentUser";
import { hasPermission, type Permission } from "./permission-map";

type Props = {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
};

export function RequirePermission({ permission, fallback, children }: Props) {
  const { data: user } = useCurrentUser();

  if (!user) return null;

  if (!hasPermission(user.role, permission)) {
    return fallback ?? (
      <div className="flex items-center justify-center py-20 text-stone-400">
        You do not have permission to view this section.
      </div>
    );
  }

  return <>{children}</>;
}
