"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/providers/AuthProvider";

type RoleGuardProps = {
  allowedRoles: string[];
  children: React.ReactNode;
};

function normalizeRole(value: string | null | undefined): string {
  return (value || "").trim().toUpperCase();
}

export default function RoleGuard({
  allowedRoles,
  children,
}: RoleGuardProps) {
  const router = useRouter();
  const pathname = usePathname();

  const { role, isAuthenticated, isLoading } = useAuth();

  const normalizedAllowedRoles = useMemo(
    () => allowedRoles.map((item) => normalizeRole(item)),
    [allowedRoles]
  );

  const effectiveRole = useMemo(() => {
    return normalizeRole(role);
  }, [role]);

  // If AuthProvider is still hydrating from localStorage, wait.
  const isReady = !isLoading;

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      if (typeof window !== "undefined" && (window as any).__subidha_logging_out) {
        return;
      }
      const next = pathname || "/";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (!normalizedAllowedRoles.includes(effectiveRole)) {
      router.replace("/unauthorized");
    }
  }, [
    isReady,
    isAuthenticated,
    effectiveRole,
    normalizedAllowedRoles,
    pathname,
    router,
  ]);

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground select-none">
        <div className="flex flex-col items-center gap-2.5">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs font-medium text-muted-foreground animate-pulse">Loading workspace…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (!normalizedAllowedRoles.includes(effectiveRole)) return null;

  return <>{children}</>;
}
