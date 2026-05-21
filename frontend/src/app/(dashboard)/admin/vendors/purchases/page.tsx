"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorPurchasesPage() {
  return (
    <ERPPageShell
      title="Vendor purchases"
      subtitle="Purchase orders and purchase bills visibility for vendors."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor purchases" }]}
    >
      <ERPSectionShell title="Procurement workspace handoff" description="Use the existing purchase order, receipt/GRN, and bill modules for full procurement documents.">
        <div className="rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm shadow-[inset_0_1px_0_var(--hairline-shine)]">
          Use purchase order, receipt, and bill modules for detailed procurement documents.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
