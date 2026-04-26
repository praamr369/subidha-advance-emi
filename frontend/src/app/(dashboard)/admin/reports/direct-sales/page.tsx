"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportDirectSalesPerformance } from "@/services/phase5-control";

export default function AdminReportDirectSalesPage() {
  return (
    <Phase5ReportSurface
      title="Direct Sale Performance"
      subtitle="Retail direct-sale trend and revenue analytics from authoritative sales records."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Direct Sales" }]}
      fetcher={() => getAdminReportDirectSalesPerformance()}
    />
  );
}

