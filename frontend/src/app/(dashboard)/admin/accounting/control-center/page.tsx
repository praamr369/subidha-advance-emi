"use client";

import Phase5ReportSurface from "@/components/admin/Phase5ReportSurface";
import { getAdminAccountingControlCenter } from "@/services/phase5-control";

export default function AdminAccountingControlCenterPage() {
  return (
    <Phase5ReportSurface
      title="Accounting Control Center"
      subtitle="Admin-only accounting command surface with receivables, reconciliation, deposits, and finance KPI controls."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Accounting", href: "/admin/accounting" },
        { label: "Control Center" },
      ]}
      fetcher={(query) => getAdminAccountingControlCenter(query)}
    />
  );
}

