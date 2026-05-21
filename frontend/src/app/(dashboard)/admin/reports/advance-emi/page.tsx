"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportAdvanceEmiPerformance } from "@/services/phase5-control";

export default function AdminReportAdvanceEmiPage() {
  return (
    <Phase5ReportSurface
      title="Advance EMI Performance"
      subtitle="Advance EMI KPI and trend analytics from subscription and EMI schedule records."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Advance EMI" }]}
      fetcher={(query) => getAdminReportAdvanceEmiPerformance(query)}
      uiVariant="erp"
    />
  );
}
