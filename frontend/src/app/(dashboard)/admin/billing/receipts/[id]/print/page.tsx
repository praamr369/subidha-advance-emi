"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  DocumentAmountSummary,
  DocumentAuditFooter,
  DocumentHeader,
  DocumentMetadataGrid,
  DocumentPage,
  DocumentPartyPanel,
  DocumentSignatureBlock,
  DocumentTermsBlock,
  DocumentTitleStrip,
} from "@/components/documents/document-shell";
import { PrintToolbar } from "@/components/documents/print-toolbar";
import { subidhaDocumentTheme, type DocumentCopyLabel } from "@/lib/documents/document-theme";
import {
  documentStatusWatermark,
  documentUnsafeStatusMessage,
  formatDocumentDate,
  formatDocumentMoney,
  normalizeDocumentStatus,
  unsafeDocumentStatusLabel,
  safeDocumentText,
} from "@/lib/documents/formatters";
import { apiFetch } from "@/lib/api";
import type { ReceiptDocument } from "@/services/billing";

type ReceiptPrintPayload = ReceiptDocument & {
  payment_method?: string | null;
  payment_reference_no?: string | null;
  collected_by_username?: string | null;
  balance_after_payment?: string | null;
  billing_invoice_no?: string | null;
  subscription_number?: string | null;
};

function receiptTitle(receipt: ReceiptPrintPayload): string {
  if (receipt.receipt_type === "EMI_PAYMENT_RECEIPT") return "EMI PAYMENT RECEIPT";
  return "PAYMENT RECEIPT";
}

function receiptDisplayStatus(status: string | null | undefined): string {
  return unsafeDocumentStatusLabel(status) || normalizeDocumentStatus(status) || "—";
}

function sourceReference(receipt: ReceiptPrintPayload): string {
  return (
    receipt.source_reference ||
    receipt.direct_sale_no ||
    receipt.billing_invoice_no ||
    receipt.subscription_number ||
    (receipt.billing_invoice ? `Invoice ${receipt.billing_invoice}` : "") ||
    (receipt.direct_sale ? `Direct Sale ${receipt.direct_sale}` : "") ||
    (receipt.subscription ? `Subscription ${receipt.subscription}` : "") ||
    (receipt.payment ? `Payment ${receipt.payment}` : "") ||
    "—"
  );
}

export default function BillingReceiptPrintPage() {
  const params = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<ReceiptPrintPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<DocumentCopyLabel>("Original");

  useEffect(() => {
    let cancelled = false;
    async function loadReceipt() {
      if (!params?.id) {
        setError("Receipt id is missing.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const payload = await apiFetch<ReceiptPrintPayload>(`/billing/receipts/${params.id}/`);
        if (!cancelled) {
          setReceipt(payload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setReceipt(null);
          setError(err instanceof Error ? err.message : "Failed to load printable receipt.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReceipt();
    return () => {
      cancelled = true;
    };
  }, [params?.id]);

  const watermark = documentStatusWatermark(receipt?.status);
  const backHref = useMemo(() => {
    if (!receipt) return "/admin/billing/receipts";
    const query = new URLSearchParams();
    if (receipt.direct_sale) query.set("direct_sale", String(receipt.direct_sale));
    if (receipt.billing_invoice) query.set("billing_invoice", String(receipt.billing_invoice));
    if (receipt.payment) query.set("payment", String(receipt.payment));
    if (receipt.subscription) query.set("subscription", String(receipt.subscription));
    const suffix = query.toString();
    return `/admin/billing/receipts${suffix ? `?${suffix}` : ""}`;
  }, [receipt]);

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading printable receipt…</div>;
  }

  if (error || !receipt) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Receipt not found."}
        </div>
      </div>
    );
  }

  const displayStatus = receiptDisplayStatus(receipt.status);
  const unsafeStatusMessage = documentUnsafeStatusMessage(receipt.status, "receipt");

  return (
    <>
      <PrintToolbar copyLabel={copyLabel} onCopyLabelChange={setCopyLabel} backHref={backHref} />
      <DocumentPage watermark={watermark}>
        <DocumentHeader
          copyLabel={copyLabel}
          documentNo={receipt.receipt_no || `Receipt ${receipt.id}`}
          documentDate={formatDocumentDate(receipt.receipt_date)}
        />
        <DocumentTitleStrip
          title={receiptTitle(receipt)}
          subtitle="Receipt generated from posted Subidha billing records."
          status={displayStatus}
        />
        {unsafeStatusMessage ? (
          <div className="document-card mb-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {unsafeStatusMessage}
          </div>
        ) : null}
        <DocumentMetadataGrid
          items={[
            { label: "Receipt No", value: safeDocumentText(receipt.receipt_no, `#${receipt.id}`) },
            { label: "Receipt Date", value: formatDocumentDate(receipt.receipt_date) },
            { label: "Receipt Type", value: safeDocumentText(receipt.receipt_type) },
            { label: "Status", value: displayStatus },
            { label: "Source Type", value: safeDocumentText(receipt.source_type) },
            { label: "Source Ref", value: sourceReference(receipt) },
            { label: "Branch", value: safeDocumentText(receipt.branch_name || receipt.branch_code) },
            { label: "Counter", value: safeDocumentText(receipt.cash_counter_name || receipt.cash_counter_code) },
          ]}
        />
        <DocumentPartyPanel
          parties={[
            {
              title: "Received By",
              name: subidhaDocumentTheme.businessName,
              phone: subidhaDocumentTheme.phone,
              email: subidhaDocumentTheme.email,
              address: subidhaDocumentTheme.addressLines.join("\n"),
            },
            {
              title: "Received From",
              name: receipt.customer_name_snapshot || "Counter Party",
              phone: receipt.customer_phone_snapshot,
              address: sourceReference(receipt),
            },
          ]}
        />
        <DocumentAmountSummary
          rows={[
            { label: "Amount Paid", value: formatDocumentMoney(receipt.amount), strong: true },
            { label: "Payment Method", value: safeDocumentText(receipt.payment_method || receipt.finance_account_name) },
            { label: "Transaction / Reference ID", value: safeDocumentText(receipt.payment_reference_no || receipt.source_reference) },
            { label: "Collected By", value: safeDocumentText(receipt.collected_by_username) },
            { label: "Finance Account", value: safeDocumentText(receipt.finance_account_name) },
            { label: "Balance After Payment", value: safeDocumentText(receipt.balance_after_payment) },
          ]}
        />
        <DocumentTermsBlock
          terms={[
            "This receipt only confirms the amount shown as received in the system record.",
            "Voided, cancelled, or reversed receipts are preserved for audit and are not proof of active payment.",
            "Outstanding balances, if any, remain collectible through the approved collection workflow.",
          ]}
        />
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
