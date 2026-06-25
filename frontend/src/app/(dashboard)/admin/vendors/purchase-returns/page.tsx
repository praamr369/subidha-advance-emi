"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorPurchaseReturnsPage() {
  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Purchase Returns"
      subtitle="Vendor-side purchase return records with stock reversal and payable adjustment history. Return posting is controlled by the existing reversal services — no direct posting from this view."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases", href: ROUTES.admin.purchases },
        { label: "Purchase Returns" },
      ]}
      actions={[
        { href: ROUTES.admin.purchases, label: "Purchases Hub", variant: "secondary" },
        { href: ROUTES.admin.purchaseReceipts, label: "Goods Receipts", variant: "secondary" },
        { href: ROUTES.admin.purchaseBills, label: "Purchase Bills", variant: "secondary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <ERPSectionShell title="Audit-safe note" description="Purchase return posting remains controlled by existing reversal services — no direct posting from this view.">
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Purchase returns are controlled by the existing reversal posting services and remain audit-safe. Use Billing Reversals for direct-sale returns and the Accounting & Reconciliation module for bridge posting.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
