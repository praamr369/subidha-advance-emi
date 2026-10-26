"use client";
import { formatRupee } from "@/lib/utils/currency";
import { downloadAuthenticatedFile } from "@/lib/export/auth-download";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, CheckCircle2, X, ArrowRight } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { getCustomerDirectSale, type CustomerDirectSaleDetail } from "@/services/customer";
import { createCustomerSupportTicket } from "@/services/support";
import CustomerProductLink from "@/components/customers/CustomerProductInspectModal";


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

  // Return modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnKind, setReturnKind] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [selectedLines, setSelectedLines] = useState<Record<number, boolean>>({});
  const [returnReason, setReturnReason] = useState("DEFECT");
  const [itemCondition, setItemCondition] = useState("OPENED_UNUSED");
  const [returnNotes, setReturnNotes] = useState("");
  const [pickupContact, setPickupContact] = useState("");
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const [returnSuccessTicket, setReturnSuccessTicket] = useState<{ id: number; ticket_no: string } | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);

  const toggleLine = (idx: number) => {
    setSelectedLines((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;

    const itemsReturned = (row.line_items || [])
      .filter((_, idx) => (Object.keys(selectedLines).length === 0 ? true : selectedLines[idx]))
      .map((line) => `- ${line.description || "Item"} (Qty: ${line.quantity})`)
      .join("\n");

    setSubmittingReturn(true);
    setReturnError(null);

    const kindLabel = returnKind === "EXCHANGE" ? "Exchange" : "Return & Refund";
    const descriptionText = [
      `Request Type: ${kindLabel}`,
      `Reason: ${returnReason}`,
      `Item Condition: ${itemCondition}`,
      `Items:\n${itemsReturned || "All items in invoice"}`,
      returnNotes.trim() ? `Customer Notes:\n${returnNotes.trim()}` : null,
      pickupContact.trim() ? `Pickup / Contact Info: ${pickupContact.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      const ticket = await createCustomerSupportTicket({
        category: "RETURN_REQUEST",
        link_type: "direct_sale",
        link_object_id: Number(row.id),
        subject: `[${kindLabel} Request] Direct Sale #${row.invoice_number || row.id}`,
        description: descriptionText,
        preferred_contact_time: pickupContact.trim() || undefined,
      });

      setReturnSuccessTicket({ id: ticket.id, ticket_no: ticket.ticket_no });
      setShowReturnModal(false);
      setReturnNotes("");
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : "Failed to submit return request.");
    } finally {
      setSubmittingReturn(false);
    }
  };

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
          {returnSuccessTicket ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 p-4 text-sm text-green-900 dark:text-green-300">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="size-5 text-green-600 dark:text-green-400 shrink-0" />
                  <span>Return / Exchange Request Created ({returnSuccessTicket.ticket_no})</span>
                </div>
                <Link
                  href={`/customer/support/${returnSuccessTicket.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold underline hover:no-underline"
                >
                  <span>View Ticket</span>
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <p className="mt-1 text-xs text-green-800/80 dark:text-green-300/80">
                Admin service desk has received your request and will schedule an inspection/pickup.
              </p>
            </div>
          ) : null}

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
                <div className="mt-1 text-sm font-semibold">{formatRupee(row.grand_total)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Outstanding</div>
                <div className="mt-1 text-sm font-semibold">{formatRupee(row.outstanding_amount)}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {row.invoice_pdf_url ? (
                <button
                  onClick={() => {
                    const url = new URL(row.invoice_pdf_url!, window.location.origin);
                    void downloadAuthenticatedFile(url.pathname, `invoice-${row.id}.pdf`);
                  }}
                  className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  Download Invoice
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setShowReturnModal(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary hover:bg-primary/20 transition active:scale-95"
              >
                <RotateCcw className="size-3.5" />
                <span>Request Return / Exchange</span>
              </button>
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
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.subtotal)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Discount</td>
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.discount_total)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Taxable amount</td>
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.taxable_total)}</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="px-3 py-2 text-muted-foreground">Tax total</td>
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.tax_total)}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-semibold">Grand total</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatRupee(row.grand_total)}</td>
                  </tr>
                  <tr className="border-t border-border bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">Paid</td>
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.paid_amount)}</td>
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="px-3 py-2 text-muted-foreground">Due</td>
                    <td className="px-3 py-2 text-right font-medium">{formatRupee(row.outstanding_amount)}</td>
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
                        <td className="px-3 py-2">
                          <CustomerProductLink
                            productId={Number(line.product_id) || null}
                            productName={String(line.product_name || line.description || "Item")}
                            productImage={typeof line.product_image === "string" ? line.product_image : null}
                            showThumbnail
                            thumbnailSize="sm"
                            inspectButtonLabel="Inspect Gallery"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">{stringify(line.quantity)}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(String(line.unit_price ?? "0.00"))}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(String(line.discount_amount ?? "0.00"))}</td>
                        <td className="px-3 py-2 text-right">{formatRupee(String(line.line_total ?? "0.00"))}</td>
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
                      {receipt.receipt_date || "—"} · {receipt.payment_method || "—"} · {formatRupee(receipt.amount)}
                    </div>
                    {receipt.receipt_pdf_url ? (
                      <button
                        onClick={() => {
                          const url = new URL(receipt.receipt_pdf_url!, window.location.origin);
                          void downloadAuthenticatedFile(url.pathname, `receipt-${receipt.id}.pdf`);
                        }}
                        className="mt-2 inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
                      >
                        Download Receipt
                      </button>
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

      {/* Return / Exchange Modal */}
      {showReturnModal && row ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Request Return / Exchange</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Direct Sale #{row.invoice_number || row.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReturnModal(false)}
                className="rounded-xl p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmitReturn(e)} className="mt-4 space-y-4">
              {returnError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {returnError}
                </div>
              ) : null}

              {/* Kind tabs */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Request Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReturnKind("RETURN")}
                    className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                      returnKind === "RETURN"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    Return for Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnKind("EXCHANGE")}
                    className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                      returnKind === "EXCHANGE"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    Exchange Product
                  </button>
                </div>
              </div>

              {/* Items to return */}
              {row.line_items && row.line_items.length > 0 ? (
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                    Select item(s) to return / exchange
                  </label>
                  <div className="space-y-1.5 rounded-2xl border border-border p-3 bg-muted/20">
                    {row.line_items.map((line, idx) => {
                      const isChecked = selectedLines[idx] ?? (Object.keys(selectedLines).length === 0);
                      return (
                        <label
                          key={idx}
                          className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-muted/40 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLine(idx)}
                            className="size-4 rounded text-primary focus:ring-primary"
                          />
                          <span className="font-medium text-foreground flex-1">
                            {stringify(line.description || "Direct sale item")}
                          </span>
                          <span className="text-muted-foreground">Qty: {stringify(line.quantity)}</span>
                          <span className="font-semibold">{formatRupee(String(line.line_total ?? 0))}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Reason for return</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="DEFECT">Manufacturing defect / Structural issue</option>
                  <option value="TRANSIT_DAMAGE">Damaged in transit / Delivery</option>
                  <option value="WRONG_ITEM">Wrong item / Color / Model received</option>
                  <option value="NOT_AS_DESCRIBED">Different from website description</option>
                  <option value="UNSATISFIED">Quality / Appearance not as expected</option>
                  <option value="OTHER">Other reason</option>
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Condition of goods</label>
                <select
                  value={itemCondition}
                  onChange={(e) => setItemCondition(e.target.value)}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="OPENED_UNUSED">Opened but completely unused</option>
                  <option value="UNOPENED">Unopened in original box/packaging</option>
                  <option value="USED_DAMAGED">Used / Defective / Damaged</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Additional details / Notes</label>
                <textarea
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Explain why you are returning or what replacement item you prefer"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30 min-h-[70px] resize-none"
                />
              </div>

              {/* Pickup / Contact */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pickup contact & preferred time</label>
                <input
                  type="text"
                  value={pickupContact}
                  onChange={(e) => setPickupContact(e.target.value)}
                  placeholder="e.g. Call 9876543210, available afternoons"
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingReturn}
                  className="flex-1 rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 transition"
                >
                  {submittingReturn ? "Submitting Request…" : "Confirm Request"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="rounded-2xl border border-border bg-background px-4 py-2.5 text-xs font-semibold hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
