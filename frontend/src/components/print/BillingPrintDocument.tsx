import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";

type PrintField = {
  label: string;
  value: ReactNode;
};

type BillingPrintDocumentProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: string;
  summaryFields: PrintField[];
  detailFields: PrintField[];
  footerNote?: string;
};

function PrintCard({ label, value }: PrintField) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

export default function BillingPrintDocument({
  title,
  subtitle,
  reference,
  meta,
  summaryFields,
  detailFields,
  footerNote = "Use browser print to retain a paper copy or save this document as PDF.",
}: BillingPrintDocumentProps) {
  return (
    <section className="rounded-3xl border border-border bg-card shadow-sm">
      <div className="space-y-6 p-5 sm:p-6">
        <DocumentHeader title={title} subtitle={subtitle} reference={reference} meta={meta} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryFields.map((field) => (
            <PrintCard key={field.label} {...field} />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {detailFields.map((field) => (
            <PrintCard key={field.label} {...field} />
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          {footerNote}
        </div>
      </div>
    </section>
  );
}

