"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorPurchaseReturnsPage() {
  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor purchase returns"
      subtitle="Vendor-side purchase return visibility."
      breadcrumbs={[{ label: "Admin", href: ROUTES.admin.dashboard }, { label: "Vendor purchase returns" }]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell title="Audit-safe note" description="Purchase return posting remains controlled by existing reversal services.">
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          Purchase returns stay controlled by existing reversal posting services and remain audit-safe.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
