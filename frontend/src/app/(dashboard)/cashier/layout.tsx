import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";

export default function CashierLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["CASHIER"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGuard>
  );
}
