"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportPartnerPerformance } from "@/services/phase5-control";

export default function AdminReportPartnersPage() {
  return (
    <Phase5ReportSurface
      title="Partner Performance"
      subtitle="Partner-linked customers, contracts, collections, and commission posture analytics."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Partners" }]}
      fetcher={(query) => getAdminReportPartnerPerformance(query)}
      exportType="partners"
    />
  );
}

