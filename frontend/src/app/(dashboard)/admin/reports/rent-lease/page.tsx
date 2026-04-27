"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportRentLeasePerformance } from "@/services/phase5-control";

export default function AdminReportRentLeasePage() {
  return (
    <Phase5ReportSurface
      title="Rent/Lease Performance"
      subtitle="Live rent and lease billing/deposit workflow analytics."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Rent/Lease" }]}
      fetcher={(query) => getAdminReportRentLeasePerformance(query)}
    />
  );
}

