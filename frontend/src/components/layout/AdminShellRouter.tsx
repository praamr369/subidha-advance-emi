"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import DashboardShell from "@/components/layout/DashboardShell";
import DesktopTopNavProgress from "@/components/layout/DesktopTopNavProgress";
import { AdminStandardHubSkeleton } from "@/components/feedback/RouteLoadingSkeleton";
import { applyAdminDesktopScale } from "@/lib/admin-desktop-zoom";

function isPrintDocumentRoute(pathname: string): boolean {
  return /\/print\/?$/.test(pathname) || /\/contract\/print\/?$/.test(pathname);
}

export default function AdminShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  useEffect(() => {
    if (isPrintDocumentRoute(pathname)) {
      applyAdminDesktopScale(false);
      return;
    }
    applyAdminDesktopScale(true);
    return () => {
      applyAdminDesktopScale(false);
    };
  }, [pathname]);

  if (isPrintDocumentRoute(pathname)) {
    return <RoleGuard allowedRoles={["ADMIN"]}>{children}</RoleGuard>;
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background p-6" aria-busy="true">
            <DesktopTopNavProgress />
            <AdminStandardHubSkeleton />
          </div>
        }
      >
        <DesktopTopNavProgress />
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </RoleGuard>
  );
}
