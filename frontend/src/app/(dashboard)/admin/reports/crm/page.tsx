"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportCrmPerformance } from "@/services/phase5-control";

export default function AdminReportCrmPage() {
  return (
    <Phase5ReportSurface
      title="CRM Performance"
      subtitle="Customer lifecycle and lead-conversion analytics with KYC status signals."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "CRM" }]}
      fetcher={(query) => getAdminReportCrmPerformance(query)}
    />
  );
}

