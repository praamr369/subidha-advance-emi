import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={["PARTNER"]}><DashboardShell>{children}</DashboardShell></RoleGuard>;
}
