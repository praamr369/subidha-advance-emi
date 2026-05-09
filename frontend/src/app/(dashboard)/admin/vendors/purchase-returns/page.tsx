"use client";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorPurchaseReturnsPage() {
  return (
    <PortalPage title="Vendor Purchase Returns" subtitle="Vendor-side purchase return visibility." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor Purchase Returns" }]}>
      <div className="rounded border p-3 text-sm">Purchase returns stay controlled by existing reversal posting services and remain audit-safe.</div>
    </PortalPage>
  );
}
