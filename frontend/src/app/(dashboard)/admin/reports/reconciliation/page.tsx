"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportReconciliationAnalysis } from "@/services/phase5-control";

export default function AdminReportReconciliationPage() {
  return (
    <Phase5ReportSurface
      title="Reconciliation Analysis"
      subtitle="Unreconciled and flagged payment-reconciliation analytics."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Reconciliation" }]}
      fetcher={(query) => getAdminReportReconciliationAnalysis(query)}
      exportType="reconciliation"
      uiVariant="erp"
    />
  );
}
