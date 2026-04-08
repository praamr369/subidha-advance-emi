"use client";

import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";

export type ReceiptField = {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
};

type PaymentReceiptDocumentProps = {
  audienceLabel: string;
  receiptReference: string;
  paymentId: number;
  statusLabel: string;
  statusToneClassName: string;
  statusNote?: ReactNode;
  summaryFields: ReceiptField[];
  detailFields: ReceiptField[];
  footerNote?: string;
};

function ReceiptFieldCard({ label, value, emphasize = false }: ReceiptField) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={[
          "mt-1 text-sm text-foreground",
          emphasize ? "font-semibold" : "font-medium",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

export default function PaymentReceiptDocument({
  audienceLabel,
  receiptReference,
  paymentId,
  statusLabel,
  statusToneClassName,
  statusNote,
  summaryFields,
  detailFields,
  footerNote = "Use browser print to keep a paper copy or save this receipt as PDF.",
}: PaymentReceiptDocumentProps) {
  return (
    <section className="receipt-document rounded-3xl border border-border bg-card shadow-sm">
      <div className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-col gap-5 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
          <DocumentHeader
            title="Lucky Plan EMI Receipt"
            subtitle={audienceLabel}
            reference={`Receipt ref ${receiptReference}`}
            meta={`Payment #${paymentId}`}
          />
        </div>

        {statusNote ? <div>{statusNote}</div> : null}

        <div>
          <span
            className={[
              "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
              statusToneClassName,
            ].join(" ")}
          >
            {statusLabel}
          </span>
        </div>

        <div className="receipt-document-grid grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryFields.map((field) => (
            <ReceiptFieldCard key={field.label} {...field} />
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {detailFields.map((field) => (
            <ReceiptFieldCard key={field.label} {...field} />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {footerNote}
        </div>
      </div>
    </section>
  );
}
