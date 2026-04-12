import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";
import {
  PrintFieldGrid,
  PrintFooter,
  PrintNote,
  PrintStatusBadge,
  type PrintField,
} from "@/components/print/DocumentPrimitives";

export type BillingPrintField = PrintField;

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
  lineItems?: PrintLineItem[];
  footerNote?: string;
};

function LineItemsSection({ lineItems }: { lineItems: PrintLineItem[] }) {
  if (lineItems.length === 0) return null;

  return (
    <section className="print-doc-section space-y-2.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
        Item Summary
      </h3>
      <div className="overflow-x-auto rounded-xl border border-slate-300 bg-white">
        <table className="min-w-full border-collapse text-[12px] leading-5">
          <thead className="print-doc-accent">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Description
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Qty
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Unit Price
              </th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Line Total
              </th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr
                key={`${index}-${String(item.description)}`}
                className="border-t border-slate-200"
              >
                <td className="px-3 py-2 text-slate-900">
                  <div className="font-medium">{item.description}</div>
                  {item.note ? (
                    <div className="mt-0.5 text-[11px] text-slate-600">{item.note}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right text-slate-700">{item.quantity ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-700">{item.unitPrice ?? "—"}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900">
                  {item.lineTotal ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

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
  lineItems = [],
  footerNote = "Generated from live SUBIDHA CORE records. Print or save as PDF for business filing.",
}: BillingPrintDocumentProps) {
  return (
    <section className="receipt-document print-doc-shell rounded-[1.6rem] border border-slate-300">
      <div className="space-y-4 p-4 sm:p-5">
        <DocumentHeader
          title={title}
          subtitle={subtitle}
          reference={reference}
          meta={meta}
          metaRows={
            reference || meta
              ? [
                  ...(reference ? [{ label: "Document Reference", value: reference }] : []),
                  ...(meta ? [{ label: "Issuing Context", value: meta }] : []),
                ]
              : undefined
          }
        />

        {statusLabel ? (
          <div className="print-doc-section flex items-center rounded-xl border border-slate-300 px-3.5 py-2.5 print-doc-accent">
            <PrintStatusBadge
              label={statusLabel}
              toneClassName={statusToneClassName}
            />
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <PrintFieldGrid
            title="Party Information"
            fields={partyFields}
            columns="sm:grid-cols-2"
          />
          <PrintFieldGrid
            title="Reference Metadata"
            fields={referenceFields}
            columns="sm:grid-cols-2"
          />
        </div>

        <PrintFieldGrid
          title="Amount Summary"
          fields={summaryFields}
          columns="md:grid-cols-2 xl:grid-cols-4"
        />

        <LineItemsSection lineItems={lineItems} />

        <PrintFieldGrid
          title="Document Details"
          fields={detailFields}
          columns="md:grid-cols-2 xl:grid-cols-3"
        />

        <PrintNote>{footerNote}</PrintNote>

        <PrintFooter leftText="Prepared from live SUBIDHA CORE records" />
      </div>
    </section>
  );
}
