"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

export default function AdminVendorsLedgerPage() {
  return (
    <ERPPageShell
      title="Vendor Ledger"
      subtitle="Vendor payable ledger register."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendor Ledger" },
      ]}
      statusBadge={{ label: "Read Only", tone: "info" }}
    >
      <ERPSectionShell
        title="Ledger Access"
        description="Open a vendor detail page to inspect exact ledger entries and balances."
      >
        <div className="rounded-[1.4rem] border border-border/70 bg-[var(--surface-card-elevated)] p-4 text-sm text-muted-foreground shadow-[inset_0_1px_0_var(--hairline-shine)]">
          This surface remains a navigation stub. Vendor-by-vendor ledgers are exposed on their detail pages.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
