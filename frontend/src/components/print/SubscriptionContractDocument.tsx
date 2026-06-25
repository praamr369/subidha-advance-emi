import type { ReactNode } from "react";

import {
  AmountSummary,
  CustomerInfoBlock,
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  PrintablePaper,
  ReceiptFieldGrid,
  StatusBadge,
  TermsBlock,
  type DocumentField,
} from "@/components/documents";

type SubscriptionContractDocumentProps = {
  audienceLabel: string;
  contractReference: string;
  subscriptionId: number;
  statusLabel: string;
  statusToneClassName: string;
  customerFields: DocumentField[];
  contractFields: DocumentField[];
  financialFields: DocumentField[];
  terms?: string[];
  statusNote?: ReactNode;
  documentTitle?: string;
  issuedOn?: string;
  footerNote?: string;
};

export type ContractField = DocumentField;

export default function SubscriptionContractDocument({
  audienceLabel,
  contractReference,
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
            { label: "Contract Ref", value: contractReference },
            { label: "Status", value: statusLabel },
            ...(issuedOn ? [{ label: "Issued On", value: issuedOn }] : []),
          ]}
        />

        <div className="print-doc-section flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5 print-doc-accent">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={statusLabel} tone={statusTone} />
            <span className="text-[11px] text-slate-600">
              Contract snapshot for customer and shop operations.
            </span>
          </div>
        </div>

        {statusNote ? <div className="print-doc-section">{statusNote}</div> : null}

        <div className="grid gap-3 xl:grid-cols-2">
          <CustomerInfoBlock title="Customer Summary" fields={customerFields} />
          <ReceiptFieldGrid title="Plan / Contract Context" fields={contractFields} columns="sm:grid-cols-2" />
        </div>

        <AmountSummary title="Financial Summary" rows={financialFields} />

        <TermsBlock terms={terms} />

        <div className="print-doc-note print-doc-section rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-5 text-slate-700">
          {footerNote}
        </div>

        <DocumentFooter leftText="Prepared from SUBIDHA CORE subscription records" />
      </DocumentShell>
    </PrintablePaper>
  );
}
