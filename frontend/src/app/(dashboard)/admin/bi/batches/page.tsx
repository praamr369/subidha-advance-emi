"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function BiBatchPerformancePage() {
  return (
    <PortalPage
      eyebrow="BI Control Center"
      title="Batch Performance"
      subtitle="Read-only fill rate, payment discipline, default rate, and draw completion."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "Batches" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="batches" />
    </PortalPage>
  );
}
