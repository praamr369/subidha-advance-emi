import type { Metadata } from "next";

import AdminShellRouter from "@/components/layout/AdminShellRouter";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Admin workspace",
  "Administration, finance, inventory, CRM, reporting, and business setup operations."
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShellRouter>{children}</AdminShellRouter>;
}
