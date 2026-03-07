"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

type RoleGuardProps = {
  allowedRoles: string[];
  children: ReactNode;
};

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const role = hydrated ? (localStorage.getItem("user_role") || "").toUpperCase() : "";

  useEffect(() => {
    if (!hydrated) return;

    if (!role) {
      router.replace("/login");
      return;
    }

    if (!allowedRoles.includes(role)) {
      router.replace("/unauthorized");
    }
  }, [allowedRoles, hydrated, role, router]);

  if (!hydrated) return null;
  if (!role || !allowedRoles.includes(role)) return null;

  return <>{children}</>;
}
