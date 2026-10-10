"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import DashboardShell from "@/components/layout/DashboardShell";

function isPrintDocumentRoute(pathname: string): boolean {
  return /\/print\/?$/.test(pathname) || /\/contract\/print\/?$/.test(pathname);
}

export default function AdminShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  if (isPrintDocumentRoute(pathname)) {
    return <RoleGuard allowedRoles={["ADMIN"]}>{children}</RoleGuard>;
  }

  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <Suspense fallback={<div className="min-h-screen bg-background" aria-busy="true" />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
    </RoleGuard>
  );
}
