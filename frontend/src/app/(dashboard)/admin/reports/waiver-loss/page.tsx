"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportWaiverLossAnalysis } from "@/services/phase5-control";

export default function AdminReportWaiverLossPage() {
  return (
    <Phase5ReportSurface
      title="Waiver/Loss Analysis"
      subtitle="Waived EMI and loss-exposure analytics with auditable source references."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Waiver/Loss" }]}
      fetcher={() => getAdminReportWaiverLossAnalysis()}
    />
  );
}

