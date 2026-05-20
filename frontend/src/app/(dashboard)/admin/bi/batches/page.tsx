"use client";

import BiInsightsDashboard from "@/components/admin/bi/BiInsightsDashboard";
import { ERPPageShell } from "@/components/erp";
import { ROUTES } from "@/lib/routes";

export default function BiBatchPerformancePage() {
  return (
    <ERPPageShell
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
    </ERPPageShell>
  );
}
