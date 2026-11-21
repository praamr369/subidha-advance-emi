"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import type { ReactNode } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import DashboardShell from "@/components/layout/DashboardShell";
import DesktopTopNavProgress from "@/components/layout/DesktopTopNavProgress";
import { AdminStandardHubSkeleton } from "@/components/feedback/RouteLoadingSkeleton";
import { applyAdminDesktopScale, zoomIn, zoomOut, resetZoom } from "@/lib/admin-desktop-zoom";
import { AdminWorkspaceDockProvider } from "@/components/layout/AdminWorkspaceDockContext";

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

    // Global desktop shortcut listeners for Zoom and Laptop Resolution Scaling
    let wheelThrottle = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;

      const isZoomIn = e.key === "+" || e.key === "=" || e.code === "NumpadAdd" || (e.shiftKey && (e.key === "+" || e.code === "Equal"));
      const isZoomOut = e.key === "-" || e.key === "_" || e.code === "NumpadSubtract" || e.code === "Minus";
      const isZoomReset = e.key === "0" || e.code === "Numpad0" || e.code === "Digit0";

      if (isZoomIn) {
        e.preventDefault();
        zoomIn();
      } else if (isZoomOut) {
        e.preventDefault();
        zoomOut();
      } else if (isZoomReset) {
        e.preventDefault();
        resetZoom();
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (wheelThrottle) return;
        wheelThrottle = true;
        setTimeout(() => {
          wheelThrottle = false;
        }, 120);

        if (e.deltaY < 0) {
          zoomIn();
        } else if (e.deltaY > 0) {
          zoomOut();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      applyAdminDesktopScale(false);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
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
        <AdminWorkspaceDockProvider isDockSupported={true}>
          <DashboardShell>{children}</DashboardShell>
        </AdminWorkspaceDockProvider>
      </Suspense>
    </RoleGuard>
  );
}
