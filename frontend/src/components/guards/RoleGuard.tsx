"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);

  // Safety fallback: guarantee isReady flips true within 400ms even if storage or hydration stalls
  useEffect(() => {
    const timer = setTimeout(() => {
      setHydrationTimedOut(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const normalizedAllowedRoles = useMemo(
    () => allowedRoles.map((item) => normalizeRole(item)),
    [allowedRoles]
  );

  const effectiveRole = useMemo(() => {
    return normalizeRole(role);
  }, [role]);

  // If AuthProvider is still hydrating from localStorage, wait briefly.
  const isReady = !isLoading || hydrationTimedOut;

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      if (typeof window !== "undefined" && (window as any).__subidha_logging_out) {
        return;
      }
      const next = pathname || "/";
      const isBusinessScope =
        pathname?.startsWith("/admin") ||
        pathname?.startsWith("/partner") ||
        pathname?.startsWith("/vendor") ||
        pathname?.startsWith("/staff") ||
        pathname?.startsWith("/cashier") ||
        normalizedAllowedRoles.some((r) =>
          ["ADMIN", "PARTNER", "VENDOR", "STAFF", "CASHIER"].includes(r)
        );

      const targetLogin = isBusinessScope ? "/business/login" : "/login";
      const targetUrl = `${targetLogin}?next=${encodeURIComponent(next)}`;

      // Attempt soft client-side navigation first
      try {
        router.replace(targetUrl);
      } catch {
        // router error fallback
      }

      // Hard redirect fallback: if soft navigation hasn't navigated within 300ms, force location replace
      const timer = setTimeout(() => {
        if (typeof window !== "undefined" && window.location.pathname !== targetLogin) {
          window.location.replace(targetUrl);
        }
      }, 300);

      return () => clearTimeout(timer);
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

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground select-none">
        <div className="flex flex-col items-center gap-2.5">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs font-medium text-muted-foreground">Redirecting to Business Sign In…</span>
        </div>
      </div>
    );
  }

  if (!normalizedAllowedRoles.includes(effectiveRole)) return null;

  return <>{children}</>;
}
