import type { Metadata } from "next";
import type { ReactNode } from "react";

import StaffShell from "@/components/layout/StaffShell";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Staff workspace",
  "Private staff access to assigned tasks, attendance, payslips, and profile."
);

export default function StaffLayout({ children }: { children: ReactNode }) {
  return <StaffShell>{children}</StaffShell>;
}
