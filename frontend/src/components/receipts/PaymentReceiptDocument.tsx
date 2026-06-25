"use client";

import type { ReactNode } from "react";

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
}: PaymentReceiptDocumentProps) {
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

        <div className="print-doc-section flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 print-doc-accent">
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

        <div className="print-doc-note print-doc-section rounded-xl border border-slate-300 bg-card px-3.5 py-3 text-[13px] leading-5 text-muted-foreground">
          {footerNote}
        </div>

        <DocumentFooter leftText="Prepared from SUBIDHA CORE payment records" />
      </DocumentShell>
    </PrintablePaper>
  );
}
