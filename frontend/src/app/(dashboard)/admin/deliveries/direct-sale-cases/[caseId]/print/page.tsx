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
  formatDocumentDate,
  formatDocumentDateTime,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { buildAdminDirectSaleDeliveryChallanPrintRoute } from "@/lib/route-builders";
import {
  getAdminDirectSaleDeliveryCase,
  type DeliveryRecord,
} from "@/services/deliveries";

function deliveryWatermark(status?: string | null): string | null {
  const token = String(status || "").trim().toUpperCase();
  if (["CANCELLED", "FAILED", "VOID", "VOIDED", "RETURNED", "REVERSED"].includes(token)) {
    return token === "VOID" ? "VOIDED" : token;
  }
  return documentStatusWatermark(token);
}

function sourceReference(delivery: DeliveryRecord): string {
  return (
    delivery.source_label ||
    delivery.invoice_number ||
    delivery.invoice_document_no ||
    delivery.sale_number ||
    delivery.sale_no ||
    delivery.subscription_number ||
    delivery.case_no ||
    delivery.delivery_reference ||
    "—"
  );
}

function buildLineItems(delivery: DeliveryRecord): DocumentLineItem[] {
  const name = delivery.product_name || delivery.source_label || "Delivery item";
  const code = [delivery.product_code, delivery.invoice_number || delivery.invoice_document_no, delivery.sale_number || delivery.sale_no]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" · ");
  return [
    {
      key: delivery.product_id || delivery.id,
      description: name,
      code,
      quantity: "1",
      rate: "—",
      discount: "—",
      tax: "—",
      total: "—",
    },
  ];
}

export default function DirectSaleDeliveryChallanPrintPage() {
  const params = useParams<{ caseId: string }>();
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");

  useEffect(() => {
    let cancelled = false;
    async function loadDelivery() {
      if (!params?.caseId) {
        setError("Delivery case id is missing.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const payload = await getAdminDirectSaleDeliveryCase(params.caseId);
        if (!cancelled) {
          setDelivery(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDelivery(null);
          setError(err instanceof Error ? err.message : "Failed to load delivery challan.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadDelivery();
    return () => {
      cancelled = true;
    };
  }, [params?.caseId]);

  const lineItems = useMemo(() => (delivery ? buildLineItems(delivery) : []), [delivery]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading printable delivery challan…</div>;
  }

  if (error || !delivery) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Delivery case not found."}
        </div>
      </div>
    );
  }

  const caseId = delivery.case_id || delivery.service_case_id || delivery.id;
  const challanNo = delivery.delivery_reference || delivery.case_no || `Delivery ${caseId}`;
  const outstanding = Number(delivery.balance_total || 0);
  const releasedWithOutstanding = Boolean(delivery.payment_exception_approved_at);
  const backHref = `/admin/deliveries/direct-sale-cases/${caseId}`;

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={backHref} />
      <DocumentPage watermark={deliveryWatermark(delivery.status)}>
        <DocumentHeader
          copyLabel={copyLabel}
          documentNo={challanNo}
          documentDate={formatDocumentDate(delivery.scheduled_date || delivery.created_at)}
        />
        <DocumentTitleStrip
          title="DELIVERY CHALLAN"
          subtitle="Read-only delivery challan generated from the direct-sale delivery case record."
          status={delivery.status_label || delivery.status}
        />
        <DocumentMetadataGrid
          items={[
            { label: "Delivery Ref", value: safeDocumentText(challanNo) },
            { label: "Case No", value: safeDocumentText(delivery.case_no) },
            { label: "Source Type", value: delivery.source_type === "DIRECT_SALE" ? "Direct Sale" : safeDocumentText(delivery.source_type) },
            { label: "Source Ref", value: sourceReference(delivery) },
            { label: "Invoice", value: safeDocumentText(delivery.invoice_number || delivery.invoice_document_no) },
            { label: "Delivery Status", value: safeDocumentText(delivery.delivery_display || delivery.status_label || delivery.status) },
            { label: "Payment Gate", value: safeDocumentText(delivery.payment_state) },
            { label: "Scheduled", value: formatDocumentDate(delivery.scheduled_date) },
          ]}
        />
        <DocumentPartyPanel
          parties={[
            {
              title: "Issued By",
              name: subidhaDocumentTheme.businessName,
              phone: subidhaDocumentTheme.phone,
              email: subidhaDocumentTheme.email,
              address: subidhaDocumentTheme.addressLines.join("\n"),
            },
            {
              title: "Deliver To",
              name: delivery.receiver_name || delivery.customer_name || "Receiver",
              phone: delivery.receiver_phone || delivery.customer_phone,
              address: delivery.delivery_address_snapshot || undefined,
            },
          ]}
        />
        <DocumentLineItemsTable items={lineItems} />
        <DocumentAmountSummary
          rows={[
            { label: "Customer", value: safeDocumentText(delivery.customer_name) },
            { label: "Customer Phone", value: safeDocumentText(delivery.customer_phone) },
            { label: "Receiver", value: safeDocumentText(delivery.receiver_name) },
            { label: "Receiver Phone", value: safeDocumentText(delivery.receiver_phone) },
            { label: "Delivery State", value: safeDocumentText(delivery.delivery_state || delivery.delivery_phase_code) },
            { label: "Delivered At", value: formatDocumentDateTime(delivery.delivered_at) },
          ]}
        />
        {outstanding > 0 ? (
          <div className="document-card mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            Outstanding balance remains collectible: {delivery.balance_total}. This delivery challan does not settle payment or alter receivables.
          </div>
        ) : null}
        {releasedWithOutstanding ? (
          <div className="document-card mt-4 rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900">
            <div className="font-semibold">Admin release with outstanding balance recorded.</div>
            <div className="mt-1">
              Approved by {delivery.payment_exception_approved_by_username || "—"} at {formatDocumentDateTime(delivery.payment_exception_approved_at)}.
              Reason: {delivery.payment_exception_reason || "—"}. Snapshot: {delivery.payment_exception_outstanding_amount_snapshot || "—"}.
            </div>
            <div className="mt-1 font-semibold">This approval only releases delivery operations; receivable collection remains active.</div>
          </div>
        ) : null}
        {delivery.operational_notes || delivery.notes || delivery.failure_or_cancellation_reason ? (
          <div className="document-card mt-4 rounded-2xl border border-[#e6d6bd] bg-white p-4 text-sm text-[#6f5c46]">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-[#6f4e27]">Remarks / Notes</div>
            <div className="mt-2 whitespace-pre-line">
              {delivery.operational_notes || delivery.notes || delivery.failure_or_cancellation_reason}
            </div>
          </div>
        ) : null}
        <DocumentTermsBlock
          terms={[
            "This challan confirms delivery handling only and does not confirm payment settlement.",
            "Returned, failed, or cancelled deliveries must follow the active service desk and reversal workflows.",
            "Stock, receivable, accounting, and payment records remain governed by backend posted records.",
          ]}
        />
        <DocumentSignatureBlock
          labels={[
            subidhaDocumentTheme.signatureLabels.staff,
            subidhaDocumentTheme.signatureLabels.receiver,
          ]}
        />
        <DocumentAuditFooter />
      </DocumentPage>
    </>
  );
}
