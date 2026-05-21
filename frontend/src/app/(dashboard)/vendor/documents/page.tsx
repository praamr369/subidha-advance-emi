"use client";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function VendorDocumentsPage() {
  return (
    <ERPPageShell
      title="Documents"
      subtitle="Vendor document center."
      breadcrumbs={[{ label: "Vendor", href: ROUTES.vendor.dashboard }, { label: "Documents" }]}
    >
      <ERPSectionShell
        title="Document center"
        description="Upload/verification workflows must remain explicit and auditable. This route is reserved for the approved workflow."
      >
        <ERPEmptyState
          title="Document workflows not enabled"
          description="Document upload/verification workflow can be added on top of this vendor portal route once approved."
        />
      </ERPSectionShell>
    </ERPPageShell>
  );
}
