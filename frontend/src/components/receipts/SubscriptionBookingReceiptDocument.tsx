import {
  AmountSummary,
  CustomerInfoBlock,
  DocumentFooter,
  DocumentHeader,
  DocumentShell,
  PrintablePaper,
  ReceiptFieldGrid,
  SignatureBlock,
  StatusBadge,
  TermsBlock,
  type DocumentField,
} from "@/components/documents";

type SubscriptionBookingReceiptDocumentProps = {
  receiptReference: string;
  issuedOn: string;
  statusLabel?: string;
  audienceLabel?: string;
  customerFields: DocumentField[];
  enrollmentFields: DocumentField[];
  amountFields: DocumentField[];
  acknowledgementLines?: string[];
  footerNote?: string;
};

export default function SubscriptionBookingReceiptDocument({
  receiptReference,
  issuedOn,
  statusLabel = "BOOKED",
  audienceLabel = "Subscription enrollment confirmation for customer handover and branch records.",
  customerFields,
  enrollmentFields,
  amountFields,
  acknowledgementLines = [],
  footerNote = "This booking receipt confirms subscription enrollment details as recorded at booking time.",
}: SubscriptionBookingReceiptDocumentProps) {
  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title="Subscription Booking Receipt"
          subtitle={audienceLabel}
          status={<StatusBadge label={statusLabel} tone="success" />}
          metaFields={[
            { label: "Receipt Number", value: receiptReference },
            { label: "Booking Date", value: issuedOn },
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-2">
          <CustomerInfoBlock fields={customerFields} />
          <ReceiptFieldGrid title="Plan / Enrollment Details" fields={enrollmentFields} />
        </div>

        <AmountSummary title="Booking Financial Summary" rows={amountFields} />

        <TermsBlock
          title="Acknowledgement"
          terms={[
            ...acknowledgementLines,
            "Lucky Draw winner benefit applies to future eligible EMI waiver only.",
          ]}
        />

        <SignatureBlock />

        <div className="print-doc-note print-doc-section rounded-xl border border-border bg-card px-3.5 py-3 text-[13px] leading-5 text-muted-foreground">
          {footerNote}
        </div>

        <DocumentFooter leftText="Prepared from SUBIDHA CORE subscription booking records" />
      </DocumentShell>
    </PrintablePaper>
  );
}

