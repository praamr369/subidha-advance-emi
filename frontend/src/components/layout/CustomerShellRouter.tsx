"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import RoleGuard from "@/components/guards/RoleGuard";
import DashboardShell from "@/components/layout/DashboardShell";

function isPrintDocumentRoute(pathname: string): boolean {
  return /\/print\/?$/.test(pathname) || /\/contract\/print\/?$/.test(pathname);
}

export default function CustomerShellRouter({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  if (isPrintDocumentRoute(pathname)) {
    return <RoleGuard allowedRoles={["CUSTOMER"]}>{children}</RoleGuard>;
  }

  return (
    <RoleGuard allowedRoles={["CUSTOMER"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGuard>
  );
}
