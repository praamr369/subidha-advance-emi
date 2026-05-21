"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

export default function BiHrCostsPage() {
  return (
    <ERPPageShell
      eyebrow="BI Control Center"
      title="HR Cost Insights"
      subtitle="Read-only salary/revenue ratio, department costs, and employment-type cost split."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "HR costs" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="hr" />
    </ERPPageShell>
  );
}
