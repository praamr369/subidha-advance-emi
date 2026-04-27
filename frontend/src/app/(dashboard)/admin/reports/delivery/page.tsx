"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportDeliveryPerformance } from "@/services/phase5-control";

export default function AdminReportDeliveryPage() {
  return (
    <Phase5ReportSurface
      title="Delivery Performance"
      subtitle="Delivery, handover, return, and inspection analytics for operational command."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Delivery" }]}
      fetcher={(query) => getAdminReportDeliveryPerformance(query)}
      exportType="delivery"
    />
  );
}

