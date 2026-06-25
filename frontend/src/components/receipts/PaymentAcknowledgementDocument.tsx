import {
  AmountSummary,
  CustomerInfoBlock,
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  PaymentInfoBlock,
  PrintablePaper,
  SignatureBlock,
  StatusBadge,
  type DocumentField,
} from "@/components/documents";

type PaymentAcknowledgementDocumentProps = {
  acknowledgementReference: string;
  issuedAt: string;
  customerFields: DocumentField[];
  paymentFields: DocumentField[];
  amountFields: DocumentField[];
  note?: string;
  statusLabel?: string;
};

export default function PaymentAcknowledgementDocument({
  acknowledgementReference,
  issuedAt,
  customerFields,
  paymentFields,
  amountFields,
  note = "This slip confirms the received amount against the referenced payment transaction.",
  statusLabel = "RECEIVED",
}: PaymentAcknowledgementDocumentProps) {
  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title="Payment Acknowledgement Slip"
          subtitle="Compact customer-safe acknowledgement generated from recorded payment context."
          status={<StatusBadge label={statusLabel} tone="success" />}
          metaFields={[
            { label: "Acknowledgement No", value: acknowledgementReference },
            { label: "Issued At", value: issuedAt },
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-2">
          <CustomerInfoBlock fields={customerFields} />
          <PaymentInfoBlock fields={paymentFields} />
        </div>

        <AmountSummary title="Receipt Amount Summary" rows={amountFields} />

        <div className="print-doc-note print-doc-section rounded-xl border border-slate-300 bg-card px-3.5 py-3 text-[13px] leading-5 text-muted-foreground">
          {note}
        </div>

        <SignatureBlock />

        <DocumentFooter leftText="Prepared from SUBIDHA CORE payment acknowledgement records" />
      </DocumentShell>
    </PrintablePaper>
  );
}

