"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { getCustomerDirectSale, type CustomerDirectSaleDetail } from "@/services/customer";

function money(value: string | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function stringify(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

export default function CustomerDirectSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [row, setRow] = useState<CustomerDirectSaleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const customerSnapshot = useMemo(
    () => (row?.customer_snapshot ?? {}) as Record<string, unknown>,
    [row]
  );
  const deliverySnapshot = useMemo(
    () => (row?.delivery_snapshot ?? {}) as Record<string, unknown>,
    [row]
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const payload = await getCustomerDirectSale(id);
      setRow(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load direct-sale detail.");
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ERPPageShell
      title="Direct Sale Detail"
      subtitle="Invoice, line items, totals, and customer-scoped receipt history."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Direct Sales", href: "/customer/direct-sales" },
        { label: `Sale ${id || ""}` },
      ]}
      actions={[{ href: "/customer/direct-sales", label: "Back to Direct Sales", variant: "secondary" }]}
    >
      {loading ? <ERPLoadingState label="Loading direct-sale detail..." /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load direct sale" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && !row ? (
        <ERPEmptyState title="Direct sale not found" description="The requested direct-sale record is not available." />
      ) : null}
      {!loading && !error && row ? (
        <div className="space-y-6">
          <WorkspaceSection
            title={row.invoice_number || row.document_number || `Direct sale #${row.id}`}
            description="Customer-safe direct-sale detail."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Status</div>
                <div className="mt-1"><ERPStatusBadge status={row.status || "DRAFT"} /></div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Grand total</div>
                <div className="mt-1 text-sm font-semibold">{money(row.grand_total)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Outstanding</div>
                <div className="mt-1 text-sm font-semibold">{money(row.outstanding_amount)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.invoice_pdf_url ? (
                <a
                  href={row.invoice_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  Download Invoice
                </a>
              ) : null}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Customer snapshot" description="Snapshot values from billing document context.">
            <div className="grid gap-3 md:grid-cols-2">
              <div>Name: {stringify(customerSnapshot.name)}</div>
              <div>Phone: {stringify(customerSnapshot.phone)}</div>
              <div>Email: {stringify(customerSnapshot.email)}</div>
              <div>City: {stringify(customerSnapshot.city)}</div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            title="GST / tax summary"
            description="Document-level totals from the linked invoice (discounts remain line-level only)."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <div className="text-xs text-muted-foreground">Tax mode</div>
                <div className="mt-1 text-sm font-medium">{stringify(row.tax_mode)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Customer GSTIN</div>
                <div className="mt-1 text-sm font-medium">{stringify(row.customer_gstin)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Place of supply</div>
                <div className="mt-1 text-sm font-medium">{stringify(row.customer_snapshot_place_of_supply)}</div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
              <table className="min-w-full text-sm">
                <tbody>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Subtotal</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.subtotal)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Discount</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.discount_total)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Taxable amount</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.taxable_total)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Tax total</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.tax_total)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-semibold">Grand total</td>
                    <td className="px-3 py-2 text-right font-semibold">{money(row.grand_total)}</td>
                  </tr>
                  <tr className="border-t border-border bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">Paid</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.paid_amount)}</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">Due</td>
                    <td className="px-3 py-2 text-right font-medium">{money(row.outstanding_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Line items" description="Direct-sale line-level charges.">
            {row.line_items && row.line_items.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Discount</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.line_items.map((line, index) => (
                      <tr key={index} className="border-t border-border">
                        <td className="px-3 py-2">{stringify(line.description)}</td>
                        <td className="px-3 py-2 text-right">{stringify(line.quantity)}</td>
                        <td className="px-3 py-2 text-right">{money(String(line.unit_price ?? "0.00"))}</td>
                        <td className="px-3 py-2 text-right">{money(String(line.discount_amount ?? "0.00"))}</td>
                        <td className="px-3 py-2 text-right">{money(String(line.line_total ?? "0.00"))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ERPEmptyState title="No line items" description="This direct sale has no visible line rows." />
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Receipts and payments" description="Direct-sale-linked receipt history.">
            {row.receipts && row.receipts.length > 0 ? (
              <div className="space-y-2">
                {row.receipts.map((receipt) => (
                  <div key={receipt.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="font-medium">{receipt.receipt_number || `Receipt #${receipt.id}`}</div>
                    <div className="text-muted-foreground">
                      {receipt.receipt_date || "—"} · {receipt.payment_method || "—"} · {money(receipt.amount)}
                    </div>
                    {receipt.receipt_pdf_url ? (
                      <a
                        href={receipt.receipt_pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                      >
                        Download Receipt
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <ERPEmptyState title="No receipts yet" description="No direct-sale receipt is linked yet." />
            )}
          </WorkspaceSection>

          {row.delivery_required ? (
            <WorkspaceSection title="Delivery snapshot" description="Stored delivery snapshot from sale confirmation.">
              <div className="grid gap-3 md:grid-cols-2">
                <div>Address line 1: {stringify(deliverySnapshot.address_line1)}</div>
                <div>Address line 2: {stringify(deliverySnapshot.address_line2)}</div>
                <div>City: {stringify(deliverySnapshot.city)}</div>
                <div>State: {stringify(deliverySnapshot.state)}</div>
                <div>Pincode: {stringify(deliverySnapshot.pincode)}</div>
              </div>
            </WorkspaceSection>
          ) : null}
        </div>
      ) : null}
    </ERPPageShell>
  );
}
