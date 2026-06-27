import type { Metadata } from "next";
import type { ReactNode } from "react";

import DashboardShell from "@/components/layout/DashboardShell";
import RoleGuard from "@/components/guards/RoleGuard";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Partner workspace",
  "Private partner access to customers, subscriptions, collections, commissions, and reports."
);

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={["PARTNER"]}><DashboardShell>{children}</DashboardShell></RoleGuard>;
}
