"use client";

import { usePathname } from "next/navigation";
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
      <DashboardShell forcedRole="ADMIN">{children}</DashboardShell>
    </RoleGuard>
  );
}
