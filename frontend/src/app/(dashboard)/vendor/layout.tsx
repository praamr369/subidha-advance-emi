"use client";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={["VENDOR"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGuard>
  );
}
