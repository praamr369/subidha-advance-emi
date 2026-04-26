"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportFinancePerformance } from "@/services/phase5-control";

export default function AdminReportFinancePage() {
  return (
    <Phase5ReportSurface
      title="Finance Performance Report"
      subtitle="Collection and payment-method BI metrics from authoritative payment records."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Finance" }]}
      fetcher={() => getAdminReportFinancePerformance()}
    />
  );
}

