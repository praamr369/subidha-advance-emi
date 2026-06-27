import type { Metadata } from "next";
import type { ReactNode } from "react";

import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Secure workspace",
  "Private SUBIDHA CORE operations workspace."
);

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
