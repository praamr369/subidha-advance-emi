"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportContractPerformance } from "@/services/phase5-control";

export default function AdminReportContractsPage() {
  return (
    <Phase5ReportSurface
      title="Contract Performance Report"
      subtitle="Cross-plan contract and schedule analytics for EMI, rent, and lease."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Contracts" }]}
      fetcher={() => getAdminReportContractPerformance()}
    />
  );
}

