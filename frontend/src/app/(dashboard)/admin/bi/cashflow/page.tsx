"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

export default function BiCashflowPage() {
  return (
    <ERPPageShell
      eyebrow="BI Control Center"
      title="Cashflow Dashboard"
      subtitle="Read-only daily inflow, expected inflow, and overdue exposure."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "BI", href: ROUTES.admin.bi },
        { label: "Cashflow" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <BiInsightsDashboard mode="cashflow" />
    </ERPPageShell>
  );
}
