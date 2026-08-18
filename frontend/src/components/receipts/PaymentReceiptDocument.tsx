"use client";

import type { ReactNode } from "react";

import QRCode from "react-qr-code";

import {
  AmountSummary,
  CustomerInfoBlock,
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  PaymentInfoBlock,
  PrintablePaper,
  ReceiptFieldGrid,
  SignatureBlock,
  StatusBadge,
  type DocumentField,
} from "@/components/documents";

import { useDocumentTheme } from "@/components/documents/document-shell";

export type ReceiptField = DocumentField;

type PaymentReceiptDocumentProps = {
  audienceLabel: string;
  receiptReference: string;
  paymentId: number;
  statusLabel: string;
  statusToneClassName: string;
  statusNote?: ReactNode;
  summaryFields: ReceiptField[];
  detailFields: ReceiptField[];
  partyFields?: ReceiptField[];
  referenceFields?: ReceiptField[];
  documentTitle?: string;
  footerNote?: string;
  showUpiQr?: boolean;
  upiId?: string;
};

export default function PaymentReceiptDocument({
  audienceLabel,
  receiptReference,
  statusLabel,
  statusToneClassName,
  statusNote,
  summaryFields,
  detailFields,
  partyFields = [],
  referenceFields = [],
  documentTitle = "Payment Receipt",
  footerNote = "Generated from live SUBIDHA CORE payment records. Print or save as PDF for business filing.",
  showUpiQr,
  upiId,
}: PaymentReceiptDocumentProps) {
  const theme = useDocumentTheme();
  const resolvedShowUpiQr = showUpiQr ?? theme.showUpiQr;
  const resolvedUpiId = upiId ?? theme.upiId;

  const statusTone =
    statusToneClassName.includes("red")
      ? "danger"
      : statusToneClassName.includes("amber")
      ? "warning"
      : statusToneClassName.includes("sky")
      ? "info"
      : "success";

  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title={documentTitle}
          subtitle={audienceLabel}
          status={<StatusBadge label={statusLabel} tone={statusTone} />}
          metaFields={[
            { label: "Receipt Ref", value: receiptReference },
            { label: "Status", value: statusLabel },
          ]}
        />

        <div className="print-doc-section flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 print-doc-accent">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={statusLabel} tone={statusTone} />
            <span className="text-[11px] text-muted-foreground">
              Receipt generated from posted payment records. Keep for your records.
            </span>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Receipt Reference
            </div>
            <div className="print-doc-amount text-[13px] font-semibold text-foreground">
              {receiptReference}
            </div>
          </div>
        </div>

        {statusNote ? <div className="print-doc-section">{statusNote}</div> : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <CustomerInfoBlock
            title="Customer / Party"
            fields={partyFields}
          />
          <PaymentInfoBlock
            title="Payment Context"
            fields={referenceFields}
          />
        </div>

        <AmountSummary title="Payment Summary" rows={summaryFields} />

        <ReceiptFieldGrid
          title="Transaction Details"
          fields={detailFields}
          columns="sm:grid-cols-2"
        />

        <SignatureBlock />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print-doc-section">
          <div className="print-doc-note flex-1 rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-5 text-muted-foreground">
            {footerNote}
          </div>
          
          {resolvedShowUpiQr && resolvedUpiId ? (
            <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="rounded-lg bg-white p-2">
                <QRCode value={`upi://pay?pa=${resolvedUpiId}`} size={64} />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-foreground">Pay via UPI</p>
                <p className="text-muted-foreground">{resolvedUpiId}</p>
              </div>
            </div>
          ) : null}
        </div>

        <DocumentFooter leftText="Prepared from SUBIDHA CORE payment records" />
      </DocumentShell>
    </PrintablePaper>
  );
}
