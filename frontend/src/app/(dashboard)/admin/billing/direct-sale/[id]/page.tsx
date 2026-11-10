"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Printer,
  QrCode,
  Share2,
  Truck,
  User,
} from "lucide-react";

import DirectSaleSignatureModal from "@/components/billing/DirectSaleSignatureModal";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import StatusBadge from "@/components/ui/status-badge";
import DirectSaleCollectDrawer from "@/features/direct-sale/components/DirectSaleCollectDrawer";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { openWhatsAppDirectModal } from "@/components/whatsapp/WhatsAppDirectSenderModal";
import { getDirectSale, type DirectSale } from "@/services/billing";

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  const parsed = Date.parse(val);
  if (Number.isNaN(parsed)) return val;
  return new Date(parsed).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(val: string | null | undefined): string {
  if (!val) return "—";
  const parsed = Date.parse(val);
  if (Number.isNaN(parsed)) return val;
  return new Date(parsed).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDirectSaleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const saleIdStr = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const saleId = saleIdStr ? Number(saleIdStr) : null;

  const [sale, setSale] = useState<DirectSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);

  const loadSale = useCallback(async () => {
    if (!saleId || Number.isNaN(saleId)) {
      setError("Invalid direct sale ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getDirectSale(saleId);
      setSale(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load direct sale.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    void loadSale();
  }, [loadSale]);

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="Billing & Retail Operations"
        title="Loading Direct Sale..."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.root },
          { label: "Billing", href: ROUTES.admin.billing },
          { label: "Direct Sales", href: ROUTES.admin.billingDirectSaleWorkspace },
          { label: "Loading..." },
        ]}
      >
        <ERPLoadingState label="Loading direct sale invoice and settlement details..." />
      </ERPPageShell>
    );
  }

  if (error || !sale) {
    return (
      <ERPPageShell
        eyebrow="Billing & Retail Operations"
        title="Direct Sale Not Found"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.root },
          { label: "Billing", href: ROUTES.admin.billing },
          { label: "Direct Sales", href: ROUTES.admin.billingDirectSaleWorkspace },
          { label: "Error" },
        ]}
      >
        <div className="space-y-4">
          <ERPErrorState
            title="Direct Sale Not Found"
            message={error || "The requested direct sale record could not be found."}
          />
          <Link
            href={ROUTES.admin.billingDirectSaleWorkspace}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Direct Sales Register
          </Link>
        </div>
      </ERPPageShell>
    );
  }

  const balanceNumber = Number(sale.balance_total || 0);
  const isCollectible = balanceNumber > 0 && sale.status !== "CANCELLED";
  const customerName = sale.customer_name_snapshot || sale.customer_name || "Customer";
  const customerPhone = sale.customer_phone_snapshot || "";
  const billingAddress = [
    sale.customer_snapshot_billing_address_line1,
    sale.customer_snapshot_billing_address_line2,
    sale.customer_snapshot_city,
    sale.customer_snapshot_state,
    sale.customer_snapshot_pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const deliveryAddress = [
    sale.delivery_snapshot_address_line1,
    sale.delivery_snapshot_address_line2,
    sale.delivery_snapshot_city,
    sale.delivery_snapshot_state,
    sale.delivery_snapshot_pincode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <ERPPageShell
        eyebrow="Billing & Retail Operations"
        title={`Direct Sale — ${sale.sale_no || `#${sale.id}`}`}
        subtitle="Retail direct-sale order, tax invoice posture, lines, and collection status."
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.root },
          { label: "Billing", href: ROUTES.admin.billing },
          { label: "Direct Sales", href: ROUTES.admin.billingDirectSaleWorkspace },
          { label: sale.sale_no || `#${sale.id}` },
        ]}
        statusBadge={{
          label: sale.status,
          tone:
            sale.status === "DELIVERED"
              ? "success"
              : sale.status === "INVOICED"
              ? "info"
              : sale.status === "CANCELLED"
              ? "danger"
              : "warning",
        }}
        actions={[
          ...(isCollectible
            ? [
                {
                  label: "Collect Payment",
                  onClick: () => setCollectOpen(true),
                  variant: "primary" as const,
                },
              ]
            : []),
          {
            label: "Print Invoice",
            href: `${ROUTES.admin.billingDirectSaleWorkspace}/${sale.id}/print`,
            variant: "secondary" as const,
          },
          {
            label: "Sign / QR",
            onClick: () => setSignatureModalOpen(true),
            variant: "secondary" as const,
          },
          {
            label: "All Direct Sales",
            href: ROUTES.admin.billingDirectSaleWorkspace,
            variant: "secondary" as const,
          },
        ]}
        stats={[
          {
            label: "Grand Total",
            value: formatRupee(sale.grand_total),
            tone: "info",
          },
          {
            label: "Amount Paid",
            value: formatRupee(sale.received_total),
            tone: "success",
          },
          {
            label: "Balance Due",
            value: formatRupee(sale.balance_total),
            tone: balanceNumber > 0 ? "danger" : "default",
          },
          {
            label: "Fulfillment",
            value: sale.delivery_status || (sale.delivery_required ? "Pending" : "Delivered"),
            tone: sale.delivered_at ? "success" : sale.delivery_required ? "warning" : "default",
          },
        ]}
      >
        <div className="space-y-6">
          {/* Top Quick Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Link
                href={ROUTES.admin.billingDirectSaleWorkspace}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Direct Sales Register
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  openWhatsAppDirectModal({
                    phone: customerPhone,
                    name: customerName,
                    customerId: sale.customer || null,
                    eventType: "BILL_INVOICE",
                    amount: sale.grand_total,
                    ref: sale.billing_invoice_no || sale.sale_no || `Sale #${sale.id}`,
                    docUrl: typeof window !== "undefined" ? window.location.href : "",
                    date: sale.sale_date || "",
                    sourceModel: "DirectSale",
                    sourceId: String(sale.id),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
              >
                <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                WhatsApp Share
              </button>
              <Link
                href={`${ROUTES.admin.billingDirectSaleWorkspace}/${sale.id}/print`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
              >
                <Printer className="h-3.5 w-3.5 text-muted-foreground" />
                Print A4 Invoice
              </Link>
              <button
                type="button"
                onClick={() => setSignatureModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
              >
                <QrCode className="h-3.5 w-3.5 text-blue-600" />
                Digital Signature QR
              </button>
              {isCollectible ? (
                <button
                  type="button"
                  onClick={() => setCollectOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Collect Balance ({formatRupee(sale.balance_total)})
                </button>
              ) : null}
            </div>
          </div>

          {/* Overview Grid: Order Meta & Invoicing */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ERPSectionShell title="Order & Tax Information" description="Invoice classification, tax mode, and order sequencing.">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sale Number</div>
                  <div className="font-mono font-semibold text-foreground">{sale.sale_no || "—"}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sale Date</div>
                  <div className="font-medium text-foreground">{formatDate(sale.sale_date)}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tax Mode</div>
                  <div className="font-medium text-foreground">{sale.tax_mode || "NON_GST"} ({sale.tax_calculation_mode || "Standard"})</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Financial Year</div>
                  <div className="font-medium text-foreground">{sale.financial_year || "—"}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1 sm:col-span-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Linked Invoice Document</div>
                  <div className="flex items-center justify-between">
                    <div className="font-mono font-semibold text-foreground">
                      {sale.billing_invoice_no || "No formal invoice generated yet"}
                    </div>
                    {sale.billing_invoice_status ? (
                      <StatusBadge status={sale.billing_invoice_status} />
                    ) : null}
                  </div>
                </div>
              </div>
            </ERPSectionShell>

            <ERPSectionShell title="Customer & Delivery Posture" description="Buyer identity, phone number, and delivery status.">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Customer</div>
                  <div className="font-semibold text-foreground">{customerName}</div>
                  {sale.customer ? (
                    <Link
                      href={`/admin/customers/${sale.customer}`}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <User className="h-3 w-3" />
                      View Customer Profile
                    </Link>
                  ) : null}
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Phone</div>
                  <div className="font-mono text-foreground">{customerPhone || "—"}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1 sm:col-span-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Billing Address</div>
                  <div className="text-foreground">{billingAddress || "No address on file."}</div>
                </div>
                <div className="rounded-xl border border-border bg-background p-3.5 space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Address</div>
                    <span className="text-xs text-muted-foreground">
                      {sale.delivery_required ? "Delivery Required" : "Store Counter Handover"}
                    </span>
                  </div>
                  <div className="text-foreground">{deliveryAddress || (sale.delivery_required ? "Same as billing address" : "Store Counter Pickup")}</div>
                </div>
              </div>
            </ERPSectionShell>
          </div>

          {/* Sold Line Items Table */}
          <ERPSectionShell
            title="Purchased Products & Line Items"
            description="Itemized goods breakdown with unit rates, taxes, and subtotal amounts."
          >
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Item / Description</th>
                    <th className="px-4 py-3">SKU / Code</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Tax (GST)</th>
                    <th className="px-4 py-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sale.lines && sale.lines.length > 0 ? (
                    sale.lines.map((line, idx) => {
                      const taxTotal =
                        Number(line.cgst_amount || 0) +
                        Number(line.sgst_amount || 0) +
                        Number(line.igst_amount || 0);
                      return (
                        <tr key={line.id || idx} className="hover:bg-muted/20 transition">
                          <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{line.description || "Product Item"}</div>
                            {line.sku_snapshot ? (
                              <div className="text-xs text-muted-foreground">SKU: {line.sku_snapshot}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {line.product_code_snapshot || line.product_code || "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{line.quantity}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{formatRupee(line.unit_price)}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs">
                            {taxTotal > 0 ? formatRupee(taxTotal) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-foreground">
                            {formatRupee(line.line_total)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        No line items recorded for this direct sale.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="border-t border-border bg-muted/30 text-sm">
                  <tr>
                    <td colSpan={5} className="px-4 py-2 font-medium text-muted-foreground text-right">
                      Subtotal
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right font-semibold">
                      {formatRupee(sale.subtotal)}
                    </td>
                  </tr>
                  {Number(sale.discount_total || 0) > 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 font-medium text-emerald-600 text-right">
                        Discount
                      </td>
                      <td colSpan={2} className="px-4 py-2 text-right font-semibold text-emerald-600">
                        -{formatRupee(sale.discount_total)}
                      </td>
                    </tr>
                  ) : null}
                  {Number(sale.tax_total || 0) > 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-2 font-medium text-muted-foreground text-right">
                        GST Tax Total
                      </td>
                      <td colSpan={2} className="px-4 py-2 text-right font-semibold">
                        {formatRupee(sale.tax_total)}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="border-t border-border text-base">
                    <td colSpan={5} className="px-4 py-3 font-bold text-foreground text-right">
                      Grand Total
                    </td>
                    <td colSpan={2} className="px-4 py-3 text-right font-bold text-foreground">
                      {formatRupee(sale.grand_total)}
                    </td>
                  </tr>
                  <tr className="bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300">
                    <td colSpan={5} className="px-4 py-2 font-semibold text-right">
                      Amount Collected / Paid
                    </td>
                    <td colSpan={2} className="px-4 py-2 text-right font-bold">
                      {formatRupee(sale.received_total)}
                    </td>
                  </tr>
                  <tr className="bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-300">
                    <td colSpan={5} className="px-4 py-2.5 font-bold text-right">
                      Outstanding Balance Due
                    </td>
                    <td colSpan={2} className="px-4 py-2.5 text-right font-bold text-lg">
                      {formatRupee(sale.balance_total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </ERPSectionShell>

          {/* Settlement & Operational Status */}
          <ERPSectionShell
            title="Settlement & Operational State"
            description="Audit trace of payments, cashier receipts, and digital signing verification."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Payment Status
                </div>
                <div className="text-xl font-bold text-foreground">
                  {balanceNumber <= 0 ? "Fully Paid" : formatRupee(sale.balance_total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {balanceNumber <= 0 ? "Invoice is settled with zero outstanding balance." : "Pending collection in Collections & Cashier."}
                </div>
                {isCollectible ? (
                  <button
                    type="button"
                    onClick={() => setCollectOpen(true)}
                    className="mt-2 w-full rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition"
                  >
                    Post Receipt Now
                  </button>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Truck className="h-4 w-4 text-blue-600" />
                  Delivery & Logistics
                </div>
                <div className="text-xl font-bold text-foreground">
                  {sale.delivered_at ? "Delivered" : sale.delivery_required ? "In Queue" : "Counter Sale"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {sale.delivered_at
                    ? `Handed over on ${formatDateTime(sale.delivered_at)}`
                    : sale.delivery_required
                    ? "Dispatch pending delivery confirmation."
                    : "No home delivery requested for this order."}
                </div>
                {sale.delivery_required ? (
                  <Link
                    href={`${ROUTES.admin.deliveries}?source_type=DIRECT_SALE&focus_sale=${sale.id}`}
                    className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-border bg-background py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
                  >
                    View in Delivery Register
                  </Link>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  Signatures & Consent
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Customer Signature:</span>
                    <span className="text-xs font-medium">
                      {sale.customer_signed_at ? "Signed" : "Unsigned"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Authorized Signature:</span>
                    <span className="text-xs font-medium">
                      {sale.authorized_signed_at ? "Approved" : "Pending"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSignatureModalOpen(true)}
                  className="mt-2 w-full rounded-lg border border-border bg-background py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
                >
                  Inspect Signatures / QR
                </button>
              </div>
            </div>
          </ERPSectionShell>
        </div>
      </ERPPageShell>

      {/* Collect Drawer */}
      <DirectSaleCollectDrawer
        open={collectOpen}
        saleId={sale.id}
        onClose={() => setCollectOpen(false)}
        onCollected={() => {
          setCollectOpen(false);
          void loadSale();
        }}
      />

      {/* Digital Signature Modal */}
      {signatureModalOpen ? (
        <DirectSaleSignatureModal
          saleId={sale.id}
          isOpen={signatureModalOpen}
          onClose={() => setSignatureModalOpen(false)}
          onSignatureSaved={() => {
            setSignatureModalOpen(false);
            void loadSale();
          }}
        />
      ) : null}
    </>
  );
}
