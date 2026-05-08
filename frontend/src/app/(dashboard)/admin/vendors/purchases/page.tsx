"use client";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorPurchasesPage() {
  return (
    <PortalPage title="Vendor Purchases" subtitle="Purchase orders and purchase bills visibility for vendors." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor Purchases" }]}>
      <div className="rounded border p-3 text-sm">Use purchase order, receipt, and bill modules for detailed procurement documents.</div>
    </PortalPage>
  );
}
