"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentLineItemsTable,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
  type DocumentLineItem,
} from "@/components/documents/document-shell";
import { PrintToolbar, type PrintDocumentFormat } from "@/components/documents/print-toolbar";
import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  documentTitleForTaxMode,
  formatDocumentDate,
  formatDocumentMoney,
  joinDocumentLines,
  numberToIndianWords,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { getDirectSale, type DirectSale } from "@/services/billing";
import { openWhatsAppDirectModal } from "@/components/whatsapp/WhatsAppDirectSenderModal";
import DirectSaleSignatureModal from "@/components/billing/DirectSaleSignatureModal";

function lineTaxTotal(line: DirectSale["lines"][number]): string {
  const total =
    Number(line.cgst_amount || 0) +
    Number(line.sgst_amount || 0) +
    Number(line.igst_amount || 0);
  return formatDocumentMoney(total);
}

function buildCustomerAddress(sale: DirectSale): string {
  return joinDocumentLines([
    sale.customer_snapshot_billing_address_line1,
    sale.customer_snapshot_billing_address_line2,
    [sale.customer_snapshot_city, sale.customer_snapshot_district, sale.customer_snapshot_state, sale.customer_snapshot_pincode]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join(", "),
  ]);
}

function buildLineItems(sale: DirectSale): DocumentLineItem[] {
  return (sale.lines || []).map((line, index) => {
    let desc = line.description || `Item ${index + 1}`;
    if (line.bundled_items && line.bundled_items.length > 0) {
      const bundleDesc = line.bundled_items
        .map((b) => `${b.quantity}x ${b.name}`)
        .join(", ");
      desc = `${desc} (Includes: ${bundleDesc})`;
    }
    return {
      key: line.id || `${index}-${line.description}`,
      description: desc,
      code: [line.sku_snapshot, line.product_code_snapshot || line.product_code, line.hsn_sac_code]
        .map((part) => (part || "").trim())
        .filter(Boolean)
        .join(" · "),
      quantity: line.quantity,
      rate: formatDocumentMoney(line.unit_price),
      discount: formatDocumentMoney(line.discount_amount),
      tax: lineTaxTotal(line),
      total: formatDocumentMoney(line.line_total),
    };
  });
}

export default function DirectSaleInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<DirectSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");
  const [printFormat, setPrintFormat] = useState<PrintDocumentFormat>("A4");
  const [signModalOpen, setSignModalOpen] = useState(false);

  const reloadSale = async () => {
    if (!params?.id) return;
    try {
      const payload = await getDirectSale(params.id);
      setSale(payload);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadSale() {
      if (!params?.id) {
        setError("Direct sale id is missing.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const payload = await getDirectSale(params.id);
        if (!cancelled) {
          setSale(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSale(null);
          setError(err instanceof Error ? err.message : "Failed to load direct-sale invoice.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSale();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  const watermark = documentStatusWatermark(sale?.status);
  const lineItems = useMemo(() => (sale ? buildLineItems(sale) : []), [sale]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading printable invoice…</div>;
  }

  if (error || !sale) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Direct sale not found."}
        </div>
      </div>
    );
  }

  const title = documentTitleForTaxMode(sale.tax_mode);
  const customerAddress = buildCustomerAddress(sale);
  const backHref = `/admin/billing/direct-sale?focus_sale=${sale.id}`;

  return (
    <>
      <PrintToolbar
        copyLabel={copyLabel}
        onCopyLabelChange={setCopyLabel}
        backHref={backHref}
        format={printFormat}
        onFormatChange={setPrintFormat}
        onSignClick={() => setSignModalOpen(true)}
        onWhatsAppShare={() => {
          openWhatsAppDirectModal({
            phone: sale.customer_phone_snapshot || "",
            name: sale.customer_name_snapshot || sale.customer_name || "",
            customerId: sale.customer || null,
            eventType: "BILL_INVOICE",
            amount: sale.grand_total,
            ref: sale.billing_invoice_no || sale.sale_no || `Sale #${sale.id}`,
            docUrl: typeof window !== "undefined" ? window.location.href : "",
            date: sale.sale_date || "",
            sourceModel: "DirectSale",
            sourceId: String(sale.id),
          });
        }}
      />

      {/* 80mm Thermal POS Slip Mode */}
      {printFormat === "THERMAL_80MM" ? (
        <main className="document-screen fixed inset-0 z-[1000] min-h-screen overflow-y-auto bg-stone-200 px-4 pb-12 pt-20 font-mono text-black print:static print:z-auto print:overflow-visible print:bg-white print:p-0">
          <style jsx global>{`
            @media print {
              @page {
                size: 80mm auto;
                margin: 2mm;
              }
              html, body {
                width: 80mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .print-toolbar, [data-dashboard-shell], [data-dashboard-sidebar], [data-dashboard-topbar] {
                display: none !important;
              }
              .thermal-slip-container {
                width: 76mm !important;
                max-width: 76mm !important;
                margin: 0 auto !important;
                font-size: 11px !important;
                line-height: 1.35 !important;
                color: #000 !important;
                border: none !important;
                box-shadow: none !important;
                padding: 2mm !important;
              }
            }
          `}</style>
          <div className="thermal-slip-container mx-auto max-w-[80mm] rounded-lg border border-stone-300 bg-white p-4 shadow-xl print:border-none print:p-1 print:shadow-none">
            {/* Header */}
            <div className="mb-2.5 border-b border-dashed border-stone-400 pb-2.5 text-center">
              <h1 className="text-sm font-black tracking-tight text-black">{subidhaDocumentTheme.businessName.toUpperCase()}</h1>
              <p className="mt-0.5 text-[10px] text-stone-600">{subidhaDocumentTheme.addressLines.join(", ")}</p>
              <p className="text-[10px] text-stone-600">Ph: {subidhaDocumentTheme.phone || "Showroom"}</p>
              <div className="mt-1.5 inline-block rounded border border-stone-800 px-2 py-0.5 text-[10px] font-bold">
                {title} ({copyLabel.toUpperCase()})
              </div>
            </div>

            {/* Metadata */}
            <div className="mb-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-stone-600">Invoice No:</span>
                <span className="font-bold">{sale.billing_invoice_no || sale.sale_no || `#${sale.id}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Date:</span>
                <span>{formatDocumentDate(sale.sale_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Customer:</span>
                <span className="font-semibold">{sale.customer_name_snapshot || sale.customer_name || "Walk-in"}</span>
              </div>
              {sale.customer_phone_snapshot ? (
                <div className="flex justify-between">
                  <span className="text-stone-600">Phone:</span>
                  <span>{sale.customer_phone_snapshot}</span>
                </div>
              ) : null}
            </div>

            {/* Line Items */}
            <div className="my-2 border-b border-t border-dashed border-stone-400 py-1.5 text-[11px]">
              <div className="flex justify-between font-bold text-stone-700 pb-1 border-b border-stone-200">
                <span>Item</span>
                <span>Qty x Rate = Total</span>
              </div>
              {sale.lines?.map((line, idx) => (
                <div key={line.id || idx} className="py-1">
                  <div className="font-medium">{line.description}</div>
                  <div className="flex justify-between text-stone-600 text-[10px]">
                    <span>{line.quantity} PCS x {formatDocumentMoney(line.unit_price)}</span>
                    <span className="font-bold text-black">{formatDocumentMoney(line.line_total)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="space-y-1 py-1.5 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatDocumentMoney(sale.subtotal)}</span>
              </div>
              {Number(sale.discount_total || 0) > 0 ? (
                <div className="flex justify-between text-stone-600">
                  <span>Discount:</span>
                  <span>-{formatDocumentMoney(sale.discount_total)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-black text-sm border-t border-b border-stone-400 py-1 my-1">
                <span>GRAND TOTAL:</span>
                <span>{formatDocumentMoney(sale.grand_total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Received:</span>
                <span>{formatDocumentMoney(sale.received_total)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Balance:</span>
                <span>{formatDocumentMoney(sale.balance_total)}</span>
              </div>
            </div>

            <div className="mt-4 border-t border-dashed border-stone-400 pt-2 text-center text-[10px] text-stone-500">
              Thank you for choosing Subidha Furniture!
            </div>
          </div>
        </main>
      ) : printFormat === "A4_EXPANDED" ? (
        /* Multi-Page Classic Expanded Card Layout */
        <DocumentPage watermark={watermark}>
          <DocumentHeader
            copyLabel={copyLabel}
            documentNo={sale.billing_invoice_no || sale.sale_no || `Direct Sale ${sale.id}`}
            documentDate={formatDocumentDate(sale.sale_date)}
          />
          <DocumentTitleStrip
            title={title}
            subtitle="Direct sale invoice generated from posted Subidha business records."
            status={sale.status}
          />
          <DocumentMetadataGrid
            items={[
              { label: "Sale Ref", value: safeDocumentText(sale.sale_no, `#${sale.id}`) },
              { label: "Invoice No", value: safeDocumentText(sale.billing_invoice_no) },
              { label: "Branch", value: safeDocumentText(sale.branch_name || sale.branch_code) },
              { label: "Channel", value: "Direct Sale" },
              { label: "Tax Mode", value: safeDocumentText(sale.tax_mode) },
              { label: "Invoice Status", value: safeDocumentText(sale.billing_invoice_status || sale.status) },
              { label: "Payment State", value: safeDocumentText(sale.payment_state || sale.receipt_status) },
              { label: "Finance Account", value: safeDocumentText(sale.finance_account_name) },
            ]}
          />
          <DocumentPartyPanel
            parties={[
              {
                title: "Billed By",
                name: subidhaDocumentTheme.businessName,
                phone: subidhaDocumentTheme.phone,
                email: subidhaDocumentTheme.email,
                address: subidhaDocumentTheme.addressLines.join("\n"),
                gstin: sale.tax_mode === "GST" ? subidhaDocumentTheme.gstLabel.replace(/^GSTIN:\s*/i, "") : undefined,
              },
              {
                title: "Billed To",
                name: sale.customer_name_snapshot || sale.customer_name || "Walk-in Customer",
                phone: sale.customer_phone_snapshot,
                email: sale.customer_snapshot_email,
                address: customerAddress,
                gstin: sale.customer_gstin || undefined,
              },
            ]}
          />
          <DocumentLineItemsTable items={lineItems} />
          <DocumentAmountSummary
            rows={[
              { label: "Subtotal", value: formatDocumentMoney(sale.subtotal) },
              { label: "Discount", value: formatDocumentMoney(sale.discount_total) },
              { label: "Taxable Total", value: formatDocumentMoney(sale.taxable_total) },
              { label: "Tax Total", value: formatDocumentMoney(sale.tax_total) },
              { label: "Grand Total", value: formatDocumentMoney(sale.grand_total), strong: true },
              { label: "Received", value: formatDocumentMoney(sale.received_total) },
              {
                label: "Balance Due",
                value: formatDocumentMoney(sale.balance_total),
                strong: true,
                danger: Number(sale.balance_total || 0) > 0,
              },
            ]}
          />
          {Number(sale.balance_total || 0) > 0 ? (
            <div className="document-card my-4 rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-950 space-y-2.5">
              <div className="flex items-center justify-between border-b border-amber-200 pb-2">
                <span className="font-bold uppercase tracking-wider text-amber-900 text-[11px]">
                  Showroom Installment & Credit Terms
                </span>
                <span className="font-mono font-bold text-amber-900">
                  Outstanding Balance: {formatDocumentMoney(sale.balance_total)}
                </span>
              </div>
              {sale.terms || sale.notes ? (
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-amber-950">
                  {sale.terms || sale.notes}
                </pre>
              ) : (
                <p className="text-amber-800 text-xs">
                  Balance of {formatDocumentMoney(sale.balance_total)} is due as per agreed showroom installment schedule.
                </p>
              )}
            </div>
          ) : null}
          <DocumentTermsBlock />
          <DocumentSignatureBlock
            labels={[
              subidhaDocumentTheme.signatureLabels.authorized,
              subidhaDocumentTheme.signatureLabels.customer,
            ]}
            authorizedSignatureUrl={sale.authorized_signature}
            authorizedSignatureTimestamp={sale.authorized_signed_at}
            customerSignatureUrl={sale.customer_signature}
            customerSignatureTimestamp={sale.customer_signed_at}
          />
          <DocumentAuditFooter />
        </DocumentPage>
      ) : (
        /* Optimized Single-Page A4 Layout (Fits Exactly on 1 Page) */
        <main className="document-screen fixed inset-0 z-[1000] min-h-screen overflow-y-auto bg-[#f4eadb] px-4 pb-8 pt-20 print:static print:z-auto print:overflow-visible print:bg-white print:p-0">
          <style jsx global>{`
            @page {
              size: A4 portrait;
              margin: 7mm 8mm;
            }
            .document-screen, .document-screen * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media print {
              html, body {
                width: 210mm !important;
                height: 297mm !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #fff !important;
              }
              .print-toolbar, [data-dashboard-shell], [data-dashboard-sidebar], [data-dashboard-topbar] {
                display: none !important;
              }
              .single-page-a4 {
                width: 194mm !important;
                max-width: 194mm !important;
                margin: 0 auto !important;
                padding: 0 !important;
                font-size: 11px !important;
                color: #2f2418 !important;
                background: #fff !important;
                box-shadow: none !important;
                border: 1px solid #d9c39c !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .single-page-a4 table th,
              .single-page-a4 table td {
                padding: 4px 6px !important;
              }
            }
          `}</style>

          <section className="single-page-a4 relative mx-auto w-full max-w-[210mm] overflow-hidden rounded-xl border border-[#d9c39c] bg-[#fffaf0] p-5 text-[#2f2418] shadow-2xl print:max-w-none print:rounded-none print:border print:border-[#d9c39c] print:bg-white print:p-4 print:shadow-none">
            {/* Watermark for Void/Cancelled */}
            {watermark ? (
              <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
                <div className="rotate-[-28deg] select-none border-[5px] border-red-200 px-8 py-3 text-6xl font-black uppercase tracking-[0.2em] text-red-200/35">
                  {watermark}
                </div>
              </div>
            ) : null}

            <div className="relative z-10 space-y-2.5">
              {/* Header: Company Profile + Document Identification */}
              <div className="flex items-start justify-between border-b-2 border-[#8a5a22] pb-2.5">
                <div className="flex items-start gap-3">
                  <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#d9c39c] bg-white text-base font-black text-[#7b4c1f] shadow-2xs">
                    SF
                  </div>
                  <div>
                    <h1 className="text-lg font-black uppercase tracking-wide text-[#5e3818] leading-tight">
                      {subidhaDocumentTheme.businessName}
                    </h1>
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-[#8a5a22]">
                      {subidhaDocumentTheme.tagline}
                    </p>
                    <p className="text-[10px] text-[#6f5c46] leading-tight mt-0.5 max-w-md">
                      {subidhaDocumentTheme.addressLines.join(", ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[9px] font-medium text-[#6f5c46]">
                      <span>Ph: {subidhaDocumentTheme.phone}</span>
                      <span>Email: {subidhaDocumentTheme.email}</span>
                      <span>Web: {subidhaDocumentTheme.website}</span>
                      {sale.tax_mode === "GST" && (
                        <span className="font-bold text-[#8a5a22]">{subidhaDocumentTheme.gstLabel}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="min-w-[170px] rounded-lg border border-[#e6d6bd] bg-white p-2 text-right shadow-2xs">
                  <span className="inline-block rounded-full border border-[#c99a47] bg-[#fff2cf] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#6f4e27]">
                    {copyLabel}
                  </span>
                  <div className="mt-1 text-[9px] uppercase tracking-wider text-[#8a7255]">Invoice Number</div>
                  <div className="font-mono text-xs font-bold text-[#2f2418]">
                    {sale.billing_invoice_no || sale.sale_no || `#${sale.id}`}
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-wider text-[#8a7255]">Invoice Date</div>
                  <div className="text-xs font-semibold text-[#2f2418]">
                    {formatDocumentDate(sale.sale_date)}
                  </div>
                </div>
              </div>

              {/* Title Strip: Compact Banner */}
              <div className="flex items-center justify-between rounded-md bg-[#6f4e27] px-3 py-1.5 text-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider">
                    {title}
                  </span>
                  <span className="text-[10px] text-white/80">· Direct Sale Showroom Invoice</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    {sale.status || "POSTED"}
                  </span>
                  <span className="rounded bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                    {sale.payment_state || sale.receipt_status || "PAID"}
                  </span>
                </div>
              </div>

              {/* 2-Column Party & Details Box */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Billed To */}
                <div className="rounded-lg border border-[#e6d6bd] bg-white p-2.5 shadow-2xs">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#8a5a22]">
                    Billed To (Customer)
                  </div>
                  <div className="mt-0.5 text-sm font-bold text-[#2f2418]">
                    {sale.customer_name_snapshot || sale.customer_name || "Walk-in Customer"}
                  </div>
                  {sale.customer_phone_snapshot && (
                    <div className="text-[11px] text-[#6f5c46]">
                      Phone: <span className="font-semibold text-[#2f2418]">{sale.customer_phone_snapshot}</span>
                    </div>
                  )}
                  {customerAddress && (
                    <div className="mt-0.5 text-[10px] text-[#6f5c46] leading-tight line-clamp-2">
                      {customerAddress}
                    </div>
                  )}
                  {sale.customer_gstin && (
                    <div className="mt-1 text-[10px] font-bold text-[#8a5a22]">
                      GSTIN: {sale.customer_gstin}
                    </div>
                  )}
                </div>

                {/* Transaction Meta */}
                <div className="rounded-lg border border-[#e6d6bd] bg-white p-2.5 shadow-2xs space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-[#8a5a22]">
                    Transaction &amp; Order Meta
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">Sale Order Ref:</span>
                    <span className="font-mono font-semibold">{sale.sale_no || `#${sale.id}`}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">Showroom Branch:</span>
                    <span className="font-medium">{sale.branch_name || sale.branch_code || "Main Showroom"}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">Settlement Desk:</span>
                    <span className="font-medium">{sale.finance_account_name || "Main Cash Desk"}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground text-[10px]">Tax Mode:</span>
                    <span className="font-semibold">{sale.tax_mode === "GST" ? "GST Tax Invoice" : "Commercial Non-GST"}</span>
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="overflow-hidden rounded-lg border border-[#e6d6bd] bg-white shadow-2xs">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f0dfbd] text-left text-[10px] uppercase tracking-wider text-[#5e3818]">
                      <th className="px-2.5 py-1.5 w-7 text-center">#</th>
                      <th className="px-2.5 py-1.5">Description &amp; Specifications</th>
                      <th className="px-2.5 py-1.5 w-24">HSN / SKU</th>
                      <th className="px-2.5 py-1.5 text-right w-12">Qty</th>
                      <th className="px-2.5 py-1.5 text-right w-20">Rate</th>
                      <th className="px-2.5 py-1.5 text-right w-16">Disc</th>
                      <th className="px-2.5 py-1.5 text-right w-16">Tax</th>
                      <th className="px-2.5 py-1.5 text-right w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#eadcc6]">
                    {lineItems.map((item, idx) => (
                      <tr key={item.key} className="align-top hover:bg-muted/10">
                        <td className="px-2.5 py-1.5 text-center text-muted-foreground font-mono text-[10px]">{idx + 1}</td>
                        <td className="px-2.5 py-1.5 font-medium text-[#2f2418]">{item.description}</td>
                        <td className="px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">{item.code || "—"}</td>
                        <td className="px-2.5 py-1.5 text-right font-medium">{item.quantity}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono">{item.rate}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono">{item.discount || "—"}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono">{item.tax || "—"}</td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-bold text-[#2f2418]">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bottom Section: Words, Terms, Signatures (Left) & Summary (Right) */}
              <div className="grid grid-cols-12 gap-2.5 pt-0.5">
                {/* Left 7 Columns: Words, Terms, Signatures */}
                <div className="col-span-7 flex flex-col justify-between space-y-2">
                  <div className="space-y-1.5">
                    {/* Amount in words */}
                    <div className="rounded border border-[#e6d6bd] bg-white px-2.5 py-1.5 text-[10px] shadow-2xs">
                      <span className="font-bold text-[#8a5a22] uppercase tracking-wide">Amount in Words: </span>
                      <span className="font-semibold text-[#2f2418] italic">{numberToIndianWords(sale.grand_total)}</span>
                    </div>

                    {/* Showroom Installment & Balance Alert (if balance due) */}
                    {Number(sale.balance_total || 0) > 0 && (
                      <div className="rounded border border-amber-300 bg-amber-50/80 p-2 text-[10px] text-amber-950 leading-tight">
                        <div className="flex justify-between font-bold text-amber-900 border-b border-amber-200 pb-0.5 mb-1">
                          <span>SHOWROOM INSTALLMENT TERMS</span>
                          <span>Balance: {formatDocumentMoney(sale.balance_total)}</span>
                        </div>
                        <p className="text-amber-900">
                          {sale.terms || sale.notes || "Balance is due as per agreed showroom installment plan."}
                        </p>
                        <p className="text-[9px] text-amber-800 mt-0.5">
                          <strong>Title Retention:</strong> Goods remain the property of Subidha Furniture until full payment is received.
                        </p>
                      </div>
                    )}

                    {/* Standard Terms & Conditions */}
                    <div className="rounded border border-[#e6d6bd] bg-white/70 p-2 text-[9px] text-[#6f5c46] leading-tight">
                      <div className="font-bold uppercase tracking-wider text-[#8a5a22] mb-0.5">Terms &amp; Conditions</div>
                      <ol className="list-decimal pl-3.5 space-y-0.5">
                        <li>Goods once sold and delivered in good condition cannot be returned.</li>
                        <li>Manufacturer warranty applies as per product specifications.</li>
                        <li>Subject to Asansol jurisdiction.</li>
                      </ol>
                    </div>
                  </div>

                  {/* Dual Signatures */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#d9c39c]">
                    <div className="text-center">
                      {sale.customer_signature ? (
                        <div className="flex flex-col items-center justify-center h-10 pb-1">
                          <img
                            src={sale.customer_signature}
                            alt="Customer Signature"
                            className="max-h-9 max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="h-10" />
                      )}
                      <div className="border-t border-[#8a7255] pt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#6f4e27]">
                        Customer / Receiver
                        {sale.customer_signed_at && (
                          <span className="block text-[8px] font-normal text-stone-500">
                            {formatDocumentDate(sale.customer_signed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      {sale.authorized_signature ? (
                        <div className="flex flex-col items-center justify-center h-10 pb-1">
                          <img
                            src={sale.authorized_signature}
                            alt="Authorized Signatory"
                            className="max-h-9 max-w-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="h-10" />
                      )}
                      <div className="border-t border-[#8a7255] pt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#6f4e27]">
                        For Subidha Furniture
                        {sale.authorized_signed_at && (
                          <span className="block text-[8px] font-normal text-stone-500">
                            {formatDocumentDate(sale.authorized_signed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right 5 Columns: Amount Summary Box */}
                <div className="col-span-5 rounded-lg border border-[#e6d6bd] bg-white p-2.5 text-xs flex flex-col justify-between shadow-2xs">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#6f5c46] text-[11px]">
                      <span>Subtotal</span>
                      <span className="font-mono">{formatDocumentMoney(sale.subtotal)}</span>
                    </div>
                    {Number(sale.discount_total || 0) > 0 && (
                      <div className="flex justify-between text-emerald-700 text-[11px]">
                        <span>Discount</span>
                        <span className="font-mono">- {formatDocumentMoney(sale.discount_total)}</span>
                      </div>
                    )}
                    {sale.tax_mode === "GST" && (
                      <>
                        <div className="flex justify-between text-[#6f5c46] text-[11px]">
                          <span>Taxable Amount</span>
                          <span className="font-mono">{formatDocumentMoney(sale.taxable_total)}</span>
                        </div>
                        <div className="flex justify-between text-[#6f5c46] text-[11px]">
                          <span>Tax Total</span>
                          <span className="font-mono">{formatDocumentMoney(sale.tax_total)}</span>
                        </div>
                      </>
                    )}
                    <div className="border-t-2 border-[#8a5a22] pt-1.5 flex items-baseline justify-between text-sm font-black text-[#2f2418]">
                      <span>Grand Total</span>
                      <span className="font-mono text-base text-[#5e3818]">{formatDocumentMoney(sale.grand_total)}</span>
                    </div>
                    <div className="flex justify-between text-[#6f5c46] text-[11px] pt-0.5">
                      <span>Amount Received</span>
                      <span className="font-mono font-medium">{formatDocumentMoney(sale.received_total)}</span>
                    </div>
                  </div>

                  <div className={`mt-2 rounded p-2 text-center border font-bold text-xs ${
                    Number(sale.balance_total || 0) > 0
                      ? "bg-amber-50 border-amber-300 text-amber-900"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}>
                    <span className="uppercase text-[9px] tracking-wider block">
                      {Number(sale.balance_total || 0) > 0 ? "Balance Remaining" : "Payment Status"}
                    </span>
                    <span className="text-sm font-mono font-black">
                      {Number(sale.balance_total || 0) > 0
                        ? formatDocumentMoney(sale.balance_total)
                        : "FULLY PAID"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Audit Footer: Compact Single Line */}
              <div className="border-t border-[#e6d6bd] pt-1 text-center text-[9px] text-[#8a7255]">
                Computer Generated Invoice · {formatDocumentDate(new Date())} · Audit Copy for Subidha Furniture
              </div>
            </div>
          </section>
        </main>
      )}

      {signModalOpen && sale && (
        <DirectSaleSignatureModal
          saleId={sale.id}
          isOpen={signModalOpen}
          onClose={() => setSignModalOpen(false)}
          onSignatureSaved={reloadSale}
        />
      )}
    </>
  );
}
