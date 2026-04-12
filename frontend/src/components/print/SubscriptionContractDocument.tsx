import type { ReactNode } from "react";

import DocumentHeader from "@/components/print/DocumentHeader";
import {
  PrintFieldGrid,
  PrintFooter,
  PrintNote,
  PrintStatusBadge,
  type PrintField,
} from "@/components/print/DocumentPrimitives";

type SubscriptionContractDocumentProps = {
  audienceLabel: string;
  contractReference: string;
  subscriptionId: number;
  statusLabel: string;
  statusToneClassName: string;
  customerFields: PrintField[];
  contractFields: PrintField[];
  financialFields: PrintField[];
  terms?: string[];
  statusNote?: ReactNode;
  documentTitle?: string;
  issuedOn?: string;
  footerNote?: string;
};

export type ContractField = PrintField;

export default function SubscriptionContractDocument({
  audienceLabel,
  contractReference,
  subscriptionId,
  statusLabel,
  statusToneClassName,
  customerFields,
  contractFields,
  financialFields,
  terms = [],
  statusNote,
  documentTitle = "Subscription Contract Summary",
  issuedOn,
  footerNote = "This contract summary is generated from live subscription records. Payment, waiver, and draw histories remain auditable in canonical ledgers.",
}: SubscriptionContractDocumentProps) {
  return (
    <section className="receipt-document print-doc-shell rounded-[1.6rem] border border-slate-300">
      <div className="space-y-4 p-4 sm:p-5">
        <DocumentHeader
          title={documentTitle}
          subtitle={audienceLabel}
          metaRows={[
            { label: "Contract Ref", value: contractReference },
            { label: "Subscription", value: `#${subscriptionId}` },
            { label: "Status", value: statusLabel },
            ...(issuedOn ? [{ label: "Issued On", value: issuedOn }] : []),
          ]}
        />

        <div className="print-doc-section flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 print-doc-accent">
          <div className="flex flex-wrap items-center gap-2">
            <PrintStatusBadge
              label={statusLabel}
              toneClassName={statusToneClassName}
            />
            <span className="text-[11px] text-slate-600">
              Contract snapshot for customer and shop operations.
            </span>
          </div>
        </div>

        {statusNote ? <div className="print-doc-section">{statusNote}</div> : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <PrintFieldGrid
            title="Customer Summary"
            fields={customerFields}
            columns="sm:grid-cols-2"
          />
          <PrintFieldGrid
            title="Contract Context"
            fields={contractFields}
            columns="sm:grid-cols-2"
          />
        </div>

        <PrintFieldGrid
          title="Financial Summary"
          fields={financialFields}
          columns="md:grid-cols-2 xl:grid-cols-4"
        />

        {terms.length > 0 ? (
          <div className="print-doc-note print-doc-section rounded-xl border border-slate-300 px-3.5 py-3 text-slate-700">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Terms And Notes
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-5">
              {terms.map((term, index) => (
                <li key={`${term}-${index}`}>{term}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <PrintNote>{footerNote}</PrintNote>

        <PrintFooter leftText="Prepared from SUBIDHA CORE subscription records" />
      </div>
    </section>
  );
}
