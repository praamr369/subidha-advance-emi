import type { Metadata } from "next";
import type { ReactNode } from "react";

import CustomerShellRouter from "@/components/layout/CustomerShellRouter";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Customer portal",
  "Private access to contracts, EMI schedules, payments, deliveries, and support."
);

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <CustomerShellRouter>{children}</CustomerShellRouter>;
}
