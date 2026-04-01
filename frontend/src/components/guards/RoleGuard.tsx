"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getStoredSession } from "@/lib/auth/session";
import { useAuth } from "@/providers/AuthProvider";

type RoleGuardProps = {
  allowedRoles: string[];
  children: React.ReactNode;
};

function normalizeRole(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

function subscribeToHydration(): () => void {
  return () => {};
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false
  );
}

export default function RoleGuard({
  allowedRoles,
  children,
}: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();

  const { role, isAuthenticated, isLoading } = useAuth();

  const normalizedAllowedRoles = useMemo(
    () => allowedRoles.map((item) => normalizeRole(item)),
    [allowedRoles]
  );

  const storedSession = useMemo(() => {
    if (!hydrated) return null;
    return getStoredSession();
  }, [hydrated]);

  const effectiveRole = useMemo(() => {
    const authRole = normalizeRole(role);
    if (authRole) return authRole;
    return normalizeRole(storedSession?.role);
  }, [role, storedSession]);

  const effectiveAuthenticated = useMemo(() => {
    if (isAuthenticated) return true;

    return Boolean(
      storedSession?.accessToken && storedSession?.refreshToken
    );
  }, [isAuthenticated, storedSession]);

  const isReady = useMemo(() => {
    if (!hydrated) return false;
    if (isLoading && !storedSession && !isAuthenticated) return false;
    return true;
  }, [hydrated, isLoading, storedSession, isAuthenticated]);

  useEffect(() => {
    if (!isReady) return;

    if (!effectiveAuthenticated) {
      const next = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!normalizedAllowedRoles.includes(effectiveRole)) {
      router.replace("/unauthorized");
    }
  }, [
    isReady,
    effectiveAuthenticated,
    effectiveRole,
    normalizedAllowedRoles,
    pathname,
    router,
  ]);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (!effectiveAuthenticated) return null;
  if (!normalizedAllowedRoles.includes(effectiveRole)) return null;

  return <>{children}</>;
}
