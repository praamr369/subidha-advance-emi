"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function BiCustomerInsightsPage() {
  return (
    <ERPPageShell
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
      <ERPSectionShell
        title="Intelligence workspace"
        description="Use BI insights for review and routing; customer financial mutations remain in their owned operational workflows."
      >
        <BiInsightsDashboard mode="customers" />
      </ERPSectionShell>
    </ERPPageShell>
  );
}
