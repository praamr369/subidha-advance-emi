"use client";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorsLedgerPage() {
  return (
    <PortalPage title="Vendor Ledger" subtitle="Vendor payable ledger register." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor Ledger" }]}>
      <div className="rounded border p-3 text-sm">Open a vendor detail page to inspect exact ledger entries and balances.</div>
    </PortalPage>
  );
}
