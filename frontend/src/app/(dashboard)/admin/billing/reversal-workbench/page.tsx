"use client";

import CustomerReversalWorkbenchPanel from "@/components/admin/reversals/CustomerReversalWorkbenchPanel";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";

export default function AdminReversalWorkbenchPage() {
  return (
    <ERPPageShell
      eyebrow="Billing"
      title="Reversal & Returns Workbench"
      subtitle="One customer, every reversible artifact. Select real records — sales, receipts, subscriptions — and jump into the right reversal or return flow with everything pre-filled."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.root },
        { label: "Billing", href: ROUTES.admin.billing },
        { label: "Reversal Workbench" },
      ]}
      actions={[
        { href: ROUTES.admin.billingReversals, label: "Reversal Center", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Return Register", variant: "secondary" },
      ]}
      statusBadge={{ label: "Unified Workbench", tone: "info" }}
    >
      <CustomerReversalWorkbenchPanel />
    </ERPPageShell>
  );
}
