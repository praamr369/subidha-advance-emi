"use client";

import PaymentAcknowledgementDocument from "@/components/receipts/PaymentAcknowledgementDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { toSafeMoney } from "@/lib/print/formatters";

export default function SampleAcknowledgementPage() {
  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing"
      title="Sample Payment Acknowledgement Slip"
      subtitle="Compact acknowledgement format for quick customer handover."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples", href: "/admin/receipts/sample" },
        { label: "Acknowledgement Slip" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <PrintActionBanner
        className="mb-4"
        title="Acknowledgement Print / PDF"
        description="Generate a compact one-page acknowledgement copy."
      />

      <PaymentAcknowledgementDocument
        acknowledgementReference="ACK-2026-00390"
        issuedAt="19 Apr 2026, 11:42 AM"
        customerFields={[
          { label: "Customer", value: "Ms. Nandita Roy", emphasize: true },
          { label: "Phone", value: "+91 97755 33221" },
        ]}
        paymentFields={[
          { label: "Reference", value: "SUB-2026-0142 / EMI-M7" },
          { label: "Payment Method", value: "Cash" },
          { label: "Received By", value: "Counter SB-2" },
          { label: "Transaction Time", value: "19 Apr 2026, 11:40 AM" },
        ]}
        amountFields={[
          { label: "Amount Received", value: toSafeMoney(4200), emphasize: true },
        ]}
      />
    </ERPPageShell>
  );
}
