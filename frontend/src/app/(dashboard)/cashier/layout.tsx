import type { Metadata } from "next";
import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Cashier workspace",
  "Secure payment collection, receipt, reconciliation, and counter operations."
);

export default function CashierLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["CASHIER"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGuard>
  );
}
