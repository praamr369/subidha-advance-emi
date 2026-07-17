import type { Metadata } from "next";
import type { ReactNode } from "react";

import PartnerShellRouter from "@/components/layout/PartnerShellRouter";
import { buildPortalMetadata } from "@/lib/portal-metadata";

export const metadata: Metadata = buildPortalMetadata(
  "Partner workspace",
  "Private partner access to customers, subscriptions, collections, commissions, and reports."
);

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return <PartnerShellRouter>{children}</PartnerShellRouter>;
}
