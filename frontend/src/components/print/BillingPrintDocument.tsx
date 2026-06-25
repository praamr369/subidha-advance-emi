import type { ReactNode } from "react";

import {
  AmountSummary,
  BankQrBlock,
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  LineItemsTable,
  PartyInfoBlock,
  PaymentInfoBlock,
  PrintablePaper,
  ReceiptFieldGrid,
  StatusBadge,
  type DocumentField,
} from "@/components/documents";

export type BillingPrintField = DocumentField;

type PrintLineItem = {
  description: ReactNode;
  quantity?: ReactNode;
  unitPrice?: ReactNode;
  lineTotal?: ReactNode;
  note?: ReactNode;
};

type BillingPrintDocumentProps = {
  title: string;
  subtitle?: string;
  reference?: string;
  meta?: string;
  statusLabel?: string;
  statusToneClassName?: string;
  summaryFields: BillingPrintField[];
  detailFields: BillingPrintField[];
  partyFields?: BillingPrintField[];
  referenceFields?: BillingPrintField[];
  paymentFields?: BillingPrintField[];
  bankFields?: BillingPrintField[];
  qrLabel?: string;
  qrReference?: string;
  lineItems?: PrintLineItem[];
  footerNote?: string;
};

export default function BillingPrintDocument({
  title,
  subtitle,
  reference,
  meta,
  statusLabel,
  statusToneClassName,
  summaryFields,
  detailFields,
  partyFields = [],
  referenceFields = [],
  paymentFields = [],
  bankFields = [],
  qrLabel,
  qrReference,
  lineItems = [],
  footerNote = "Generated from live SUBIDHA CORE records. Print or save as PDF for business filing.",
}: BillingPrintDocumentProps) {
  const statusTone =
    statusToneClassName?.includes("emerald")
      ? "success"
      : statusToneClassName?.includes("amber")
      ? "warning"
      : statusToneClassName?.includes("red")
      ? "danger"
      : statusToneClassName?.includes("sky")
      ? "info"
      : "default";

  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title={title}
          subtitle={subtitle}
          status={statusLabel ? <StatusBadge label={statusLabel} tone={statusTone} /> : undefined}
          metaFields={[
            ...(reference ? [{ label: "Document Reference", value: reference }] : []),
            ...(meta ? [{ label: "Issuing Context", value: meta }] : []),
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-2">
          <PartyInfoBlock title="Bill To / Party" fields={partyFields} />
          <ReceiptFieldGrid title="Document Metadata" fields={referenceFields} columns="sm:grid-cols-2" />
        </div>

        <AmountSummary title="Amount Summary" rows={summaryFields} />

        <div className="grid gap-3 xl:grid-cols-2">
          <PaymentInfoBlock title="Payment / Collection Reference" fields={paymentFields} />
          <BankQrBlock bankFields={bankFields} qrLabel={qrLabel} qrReference={qrReference} />
        </div>

        <LineItemsTable
          items={lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.unitPrice,
            amount: item.lineTotal,
            note: item.note,
          }))}
          amountColumnLabel="Line Total"
        />

        <ReceiptFieldGrid
          title="Notes / Terms"
          fields={detailFields}
          columns="sm:grid-cols-2"
        />

        <div className="print-doc-note print-doc-section rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-5 text-slate-700">
          {footerNote}
        </div>

        <DocumentFooter leftText="Prepared from live SUBIDHA CORE records" />
      </DocumentShell>
    </PrintablePaper>
  );
}
