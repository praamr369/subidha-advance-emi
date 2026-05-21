"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorsOutstandingPage() {
  return (
    <ERPPageShell
      title="Vendor outstanding"
      subtitle="Vendor payable outstanding control view."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor outstanding" }]}
    >
      <ERPSectionShell title="Control note" description="Use vendor detail and outstanding APIs for auditable drill-down.">
        <div className="rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm shadow-[inset_0_1px_0_var(--hairline-shine)]">
          Outstanding by vendor is available through vendor detail and outstanding APIs.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
