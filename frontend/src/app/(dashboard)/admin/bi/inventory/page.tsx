"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function BiInventoryIntelligencePage() {
  return (
    <PortalPage
      eyebrow="BI Control Center"
      title="Inventory Intelligence"
      subtitle="Read-only fast-moving, slow-moving, and stock-risk intelligence."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "Inventory" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="inventory" />
    </PortalPage>
  );
}
