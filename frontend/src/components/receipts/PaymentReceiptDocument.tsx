"use client";

import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";
import {
  PrintFooter,
  PrintKeyValueGrid,
  PrintAmountSummary,
  PrintNote,
  PrintSignatureBlock,
  PrintStatusBadge,
  type PrintField,
} from "@/components/print/DocumentPrimitives";

export type ReceiptField = PrintField;

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
  return (
    <section className="receipt-document print-doc-shell rounded-[1.6rem] border border-slate-300">
      <div className="space-y-4 p-4 sm:p-5">
        <DocumentHeader
          title={documentTitle}
          subtitle={audienceLabel}
          metaRows={[
            { label: "Receipt Ref", value: receiptReference },
            { label: "Status", value: statusLabel },
          ]}
        />

        <div className="print-doc-section flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 print-doc-accent">
          <div className="flex flex-wrap items-center gap-2">
            <PrintStatusBadge
              label={statusLabel}
              toneClassName={statusToneClassName}
            />
            <span className="text-[11px] text-slate-600">
              Receipt generated from posted payment records. Keep for your records.
            </span>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Receipt Reference
            </div>
            <div className="print-doc-amount text-[13px] font-semibold text-slate-900">
              {receiptReference}
            </div>
          </div>
        </div>

        {statusNote ? <div className="print-doc-section">{statusNote}</div> : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <PrintKeyValueGrid
            title="Customer / Party"
            rows={partyFields}
            columns="sm:grid-cols-2"
          />
          <PrintKeyValueGrid
            title="Payment Context"
            rows={referenceFields}
            columns="sm:grid-cols-2"
          />
        </div>

        <PrintAmountSummary title="Payment Summary" rows={summaryFields} />

        <PrintKeyValueGrid
          title="Transaction Details"
          rows={detailFields}
          columns="sm:grid-cols-2"
        />

        <PrintSignatureBlock />

        <PrintNote>{footerNote}</PrintNote>

        <PrintFooter leftText="Prepared from SUBIDHA CORE payment records" />
      </div>
    </section>
  );
}
