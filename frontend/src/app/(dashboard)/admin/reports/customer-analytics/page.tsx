"use client";

import PortalPage from "@/components/ui/PortalPage";
import EmptyState from "@/components/feedback/EmptyState";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";

export default function CustomerAnalyticsReportPage() {
  return (
    <PortalPage
      title="Customer Analytics"
      subtitle="Understand retention, risk segments, and lifecycle value."
      headerMode="erp"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Customer analytics" },
      ]}
      actions={[
        { href: ROUTES.admin.reportsRevenue, label: "Revenue Report", variant: "secondary" },
        { href: ROUTES.admin.reportsOverdue, label: "Overdue Report", variant: "secondary" },
        { href: buildAdminReconciliationRoute(), label: "Subscription Reconciliation", variant: "secondary" },
      ]}
      statusBadge={{ label: "Not yet implemented", tone: "warning" }}
    >
      <div className="space-y-4">
        <EmptyState
          title="Customer analytics is not yet implemented"
          description="This report requires backend-supported aggregates (cohorts, retention, churn segments) and/or a stable export endpoint. Until then, use Revenue, Overdue, Batch Performance, and Reconciliation reports."
        />
      </div>
    </PortalPage>
  );
}
