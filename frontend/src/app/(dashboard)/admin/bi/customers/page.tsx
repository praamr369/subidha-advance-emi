"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";

export default function BiCustomerInsightsPage() {
  return (
    <PortalPage
      eyebrow="BI Control Center"
      title="Customer Insights"
      subtitle="Read-only customer activity, overdue, repeat, and churn-risk posture."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "Customers" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="customers" />
    </PortalPage>
  );
}
