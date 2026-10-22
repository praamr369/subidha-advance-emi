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
import { PrintToolbar, type PrintDocumentFormat } from "@/components/documents/print-toolbar";
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
import { openWhatsAppDirectModal } from "@/components/whatsapp/WhatsAppDirectSenderModal";

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
  const [printFormat, setPrintFormat] = useState<PrintDocumentFormat>("A4");

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
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || "Receipt not found."}
        </div>
      </div>
    );
  }

  const displayStatus = receiptDisplayStatus(receipt.status);
  const unsafeStatusMessage = documentUnsafeStatusMessage(receipt.status, "receipt");

  return (
    <>
      <PrintToolbar
        copyLabel={copyLabel}
        onCopyLabelChange={setCopyLabel}
        backHref={backHref}
        format={printFormat}
        onFormatChange={setPrintFormat}
        onWhatsAppShare={() => {
          openWhatsAppDirectModal({
            phone: receipt.customer_phone_snapshot || "",
            name: receipt.customer_name_snapshot || "",
            customerId: receipt.customer || null,
            eventType: "PAYMENT_RECEIPT",
            amount: receipt.amount,
            receipt: receipt.receipt_no || `#${receipt.id}`,
            ref: receipt.receipt_no || `#${receipt.id}`,
            docUrl: typeof window !== "undefined" ? window.location.href : "",
            date: receipt.receipt_date || "",
            sourceModel: "ReceiptDocument",
            sourceId: String(receipt.id),
          });
        }}
      />
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
              <p className="text-[10px] text-stone-600">Ph: {subidhaDocumentTheme.phone || "Counter"}</p>
              <div className="mt-1.5 inline-block rounded border border-stone-800 px-2 py-0.5 text-[10px] font-bold">
                {receiptTitle(receipt)} ({copyLabel.toUpperCase()})
              </div>
            </div>

            {/* Metadata */}
            <div className="mb-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-stone-600">Receipt No:</span>
                <span className="font-bold">{receipt.receipt_no || `#${receipt.id}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Date:</span>
                <span>{formatDocumentDate(receipt.receipt_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">Counter/Staff:</span>
                <span>{safeDocumentText(receipt.collected_by_username || receipt.cash_counter_code || "Main Counter")}</span>
              </div>
            </div>

            {/* Customer Details */}
            <div className="my-2 space-y-1 border-b border-t border-dashed border-stone-400 py-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-stone-600">Customer:</span>
                <span className="max-w-[150px] truncate font-semibold">{receipt.customer_name_snapshot || "Walk-in Customer"}</span>
              </div>
              {receipt.customer_phone_snapshot ? (
                <div className="flex justify-between">
                  <span className="text-stone-600">Mobile:</span>
                  <span>{receipt.customer_phone_snapshot}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-stone-600">Reference:</span>
                <span className="font-semibold">{sourceReference(receipt)}</span>
              </div>
            </div>

            {/* Payment Summary */}
            <div className="space-y-1.5 py-2 text-[11px]">
              <div className="flex items-baseline justify-between border-b border-stone-200 pb-1.5">
                <span className="text-xs font-bold uppercase text-stone-800">AMOUNT PAID:</span>
                <span className="text-base font-black text-black">
                  {formatDocumentMoney(receipt.amount)}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-stone-600">Payment Mode:</span>
                <span className="font-medium">{safeDocumentText(receipt.payment_method || receipt.finance_account_name)}</span>
              </div>
              {receipt.payment_reference_no ? (
                <div className="flex justify-between">
                  <span className="text-stone-600">Txn Ref:</span>
                  <span className="font-mono text-[10px]">{receipt.payment_reference_no}</span>
                </div>
              ) : null}
              {receipt.balance_after_payment ? (
                <div className="flex justify-between">
                  <span className="text-stone-600">Remaining Bal:</span>
                  <span>{safeDocumentText(receipt.balance_after_payment)}</span>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="mt-3 space-y-1 border-t border-dashed border-stone-400 pt-3 text-center">
              <p className="text-[10px] font-semibold text-stone-700">0% Interest Advance EMI Plan</p>
              <p className="text-[9px] text-stone-500">Computer generated receipt · Valid without signature</p>
              <p className="pt-1 text-[10px] font-bold text-stone-800">*** THANK YOU · VISIT AGAIN ***</p>
            </div>
          </div>
        </main>
      ) : (
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
            <div className="document-card mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
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
      )}
    </>
  );
}
