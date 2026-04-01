"use client";

import type { ReactNode } from "react";

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
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Subidha Furniture
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Lucky Plan EMI Receipt
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {audienceLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-background p-4 lg:min-w-[280px]">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={[
                  "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                  statusToneClassName,
                ].join(" ")}
              >
                {statusLabel}
              </span>
              <span className="text-sm text-muted-foreground">
                Receipt ref {receiptReference}
              </span>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              Payment #{paymentId}
            </div>
          </div>
        </div>

        {statusNote ? <div>{statusNote}</div> : null}

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
