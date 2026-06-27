import type { Metadata } from "next";
import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Vendor workspace",
  "Private vendor access to products, quotations, purchase orders, returns, and settlement records."
);

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={["VENDOR"]}>
      <DashboardShell>{children}</DashboardShell>
    </RoleGuard>
  );
}
