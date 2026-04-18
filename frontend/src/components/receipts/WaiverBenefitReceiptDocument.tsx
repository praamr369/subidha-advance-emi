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

type WaiverBenefitReceiptDocumentProps = {
  referenceNumber: string;
  issueDate: string;
  customerFields: DocumentField[];
  waiverFields: DocumentField[];
  waiverSummaryFields: DocumentField[];
  statusLabel?: string;
  noteLines?: string[];
};

export default function WaiverBenefitReceiptDocument({
  referenceNumber,
  issueDate,
  customerFields,
  waiverFields,
  waiverSummaryFields,
  statusLabel = "WAIVER ISSUED",
  noteLines = [
    "This receipt confirms waiver of future eligible EMI obligations under the Lucky Draw rules.",
    "This waiver receipt does not represent a refund or cashback for past paid installments.",
  ],
}: WaiverBenefitReceiptDocumentProps) {
  return (
    <PrintablePaper>
      <DocumentShell>
        <DocumentHeader
          title="Lucky Draw Waiver Benefit Receipt"
          subtitle="Official waiver confirmation generated from winner and subscription records."
          status={<StatusBadge label={statusLabel} tone="info" />}
          metaFields={[
            { label: "Reference Number", value: referenceNumber },
            { label: "Issue Date", value: issueDate },
          ]}
        />

        <div className="grid gap-3 xl:grid-cols-2">
          <CustomerInfoBlock fields={customerFields} />
          <ReceiptFieldGrid title="Waiver Context" fields={waiverFields} />
        </div>

        <AmountSummary title="Waiver Summary" rows={waiverSummaryFields} />

        <TermsBlock title="Waiver Statement" terms={noteLines} />

        <SignatureBlock />

        <DocumentFooter leftText="Prepared from SUBIDHA CORE winner/waiver records" />
      </DocumentShell>
    </PrintablePaper>
  );
}

