import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={["CUSTOMER"]}><DashboardShell>{children}</DashboardShell></RoleGuard>;
}
