"use client";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorsOutstandingPage() {
  return (
    <PortalPage title="Vendor Outstanding" subtitle="Vendor payable outstanding control view." breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor Outstanding" }]}>
      <div className="rounded border p-3 text-sm">Outstanding by vendor is available through vendor detail and outstanding APIs.</div>
    </PortalPage>
  );
}
