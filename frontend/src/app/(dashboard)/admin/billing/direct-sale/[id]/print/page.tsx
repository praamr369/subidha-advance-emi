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
import { PrintToolbar } from "@/components/documents/print-toolbar";
import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  documentTitleForTaxMode,
  formatDocumentDate,
  formatDocumentMoney,
  joinDocumentLines,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { getDirectSale, type DirectSale } from "@/services/billing";

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
  return (sale.lines || []).map((line, index) => ({
    key: line.id || `${index}-${line.description}`,
    description: line.description || `Item ${index + 1}`,
    code: [line.sku_snapshot, line.product_code_snapshot || line.product_code, line.hsn_sac_code]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join(" · "),
    quantity: line.quantity,
    rate: formatDocumentMoney(line.unit_price),
    discount: formatDocumentMoney(line.discount_amount),
    tax: lineTaxTotal(line),
    total: formatDocumentMoney(line.line_total),
  }));
}

export default function DirectSaleInvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const [sale, setSale] = useState<DirectSale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");

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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
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
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={backHref} />
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
          <div className="document-card mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Outstanding balance remains collectible. This print view does not settle payment or alter receivables.
          </div>
        ) : null}
        <DocumentTermsBlock terms={sale.terms ? [sale.terms] : undefined} />
        <DocumentSignatureBlock
          labels={[
            subidhaDocumentTheme.signatureLabels.authorized,
            subidhaDocumentTheme.signatureLabels.customer,
          ]}
        />
        <DocumentAuditFooter />
      </DocumentPage>
    </>
  );
}
