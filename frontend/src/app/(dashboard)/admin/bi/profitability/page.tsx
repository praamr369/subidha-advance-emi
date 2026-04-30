"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function BiProfitabilityPage() {
  return (
    <PortalPage
      eyebrow="BI Control Center"
      title="Profitability View"
      subtitle="Read-only income, waiver, deposit liability, and monthly operating summary."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "Profitability" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="profitability" />
    </PortalPage>
  );
}
