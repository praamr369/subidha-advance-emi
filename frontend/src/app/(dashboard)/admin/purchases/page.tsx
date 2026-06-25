"use client";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";

const CHAIN_STEPS = [
  { step: "1", label: "Vendor profile", note: "Supplier identity — under Profiles & Parties.", href: ROUTES.admin.profilesVendors },
  { step: "2", label: "Purchase request", note: "Purchase source workflow begins here.", href: ROUTES.admin.purchaseRequests },
  { step: "3", label: "Purchase order", note: "Authorised procurement commitment to vendor.", href: ROUTES.admin.purchaseOrders },
  { step: "4", label: "Purchase receipt", note: "Goods receipt creates stock ledger IN entry. Stock source workflow.", href: ROUTES.admin.purchaseReceipts },
  { step: "5", label: "Stock increase", note: "Stock on hand reflects received goods. Tracked in Inventory & Stock.", href: ROUTES.admin.inventoryStockOnHand },
  { step: "6", label: "Purchase bill", note: "Vendor bill creates the payable obligation.", href: ROUTES.admin.purchaseBills },
  { step: "7", label: "Vendor payable source", note: "Payable liability from entered purchase bills.", href: ROUTES.admin.purchaseVendorPayables },
  { step: "8", label: "Vendor payment", note: "Payment clears the payable source record.", href: ROUTES.admin.purchaseVendorPayments },
  { step: "9", label: "Accounting bridge status", note: "Bridge posting is confirmed in Accounting & Reconciliation — not auto-created here.", href: ROUTES.admin.accountingBridgeReconciliation },
  { step: "10", label: "Reconciliation evidence", note: "Verified in Accounting & Reconciliation. Purchase source records are inputs, not outputs.", href: ROUTES.admin.accountingBridgeReconciliation },
];

export default function AdminPurchasesPage() {
  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Purchases — Purchase Source Workflow"
      subtitle="Procurement chain from vendor to stock to payable. Each step is a separate auditable record. No step auto-creates the next."
      helperNote="Purchase source workflow: vendor profile → request → order → receipt → stock → bill → payable → payment → accounting bridge → reconciliation. Accounting bridge status and reconciliation evidence are confirmed in Accounting & Reconciliation, not here."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Purchases" },
      ]}
      statusBadge={{ label: "Purchase Source Workflow", tone: "info" }}
      actions={[
        { href: ROUTES.admin.purchaseRequests, label: "Purchase Requests", variant: "secondary" },
        { href: ROUTES.admin.purchaseOrders, label: "Purchase Orders", variant: "primary" },
        { href: ROUTES.admin.purchaseReceipts, label: "Goods Receipts", variant: "secondary" },
        { href: ROUTES.admin.purchaseBills, label: "Purchase Bills", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorPayables, label: "Vendor Payables", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorPayments, label: "Vendor Payments", variant: "secondary" },
        { href: ROUTES.admin.purchaseVendorReturns, label: "Vendor Returns", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendors", variant: "secondary" },
        { href: ROUTES.admin.vendorsProducts, label: "Vendor Products", variant: "secondary" },
        { href: ROUTES.admin.vendorsQuotes, label: "Quotes / Sourcing", variant: "secondary" },
      ]}
    >
      <ERPSectionShell
        title="Purchase source workflow — chain overview"
        description="Each step below is a separate auditable source record. The chain explains why stock changed and why a vendor is owed money. Accounting bridge status and reconciliation evidence are Accounting & Reconciliation concerns."
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Step</th>
                <th className="py-2 pr-4 font-medium">Document / Record</th>
                <th className="py-2 pr-4 font-medium">Purpose</th>
                <th className="py-2 font-medium">Navigate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {CHAIN_STEPS.map((row) => (
                <tr key={row.step} className="align-top">
                  <td className="py-3 pr-4 tabular-nums font-semibold text-muted-foreground">{row.step}</td>
                  <td className="py-3 pr-4 font-medium text-foreground">{row.label}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{row.note}</td>
                  <td className="py-3">
                    <a
                      href={row.href}
                      className="inline-flex h-7 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted/60"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Vendor payable source"
        description="Vendor payable is created from entered purchase bills — not from purchase receipts or purchase orders. A receipt alone does not create a payable."
      >
        <div className="rounded-[1.2rem] border border-border bg-card p-4 text-sm text-muted-foreground">
          Navigate to <strong>Purchase Bills</strong> to see entered bills, then <strong>Vendor Payables</strong> to see the derived payable register. Vendor payable source records are distinct from stock ledger source records.
        </div>
      </ERPSectionShell>

      <ERPSectionShell
        title="Accounting bridge status"
        description="Accounting bridge posting and reconciliation evidence are confirmed in Accounting & Reconciliation. This page does not auto-post accounting entries."
      >
        <div className="rounded-[1.2rem] border border-border bg-card p-4 text-sm text-muted-foreground">
          Check bridge status and reconciliation evidence at{" "}
          <a href={ROUTES.admin.accountingBridgeReconciliation} className="font-medium text-primary underline-offset-4 hover:underline">
            Accounting &gt; Bridge Reconciliation
          </a>
          . Purchase source workflow records feed the accounting bridge — they are inputs to it, not outputs.
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
