"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminOperationsCommandCenter } from "@/services/phase5-control";

export default function AdminOperationsCommandCenterPage() {
  return (
    <Phase5ReportSurface
      title="Operations Command Center"
      subtitle="Admin operations queue across contracts, deliveries, returns, KYC, partner payouts, and reconciliation alerts."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Operations", href: "/admin/operations" },
        { label: "Command Center" },
      ]}
      fetcher={(query) => getAdminOperationsCommandCenter(query)}
    />
  );
}

