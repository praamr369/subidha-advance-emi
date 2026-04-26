"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminReportInventoryPerformance } from "@/services/phase5-control";

export default function AdminReportInventoryPage() {
  return (
    <Phase5ReportSurface
      title="Inventory Performance"
      subtitle="Stock movement and inventory analytics for operations and finance visibility."
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Reports", href: "/admin/reports" }, { label: "Inventory" }]}
      fetcher={() => getAdminReportInventoryPerformance()}
    />
  );
}

