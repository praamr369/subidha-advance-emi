"use client";

import PaymentReceiptDocument from "@/components/receipts/PaymentReceiptDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { toSafeMoney } from "@/lib/print/formatters";

export default function SamplePaymentReceiptPage() {
  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing"
      title="Sample EMI Payment Receipt"
      subtitle="Customer-ready EMI receipt preview with clean payment and subscription context."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples", href: "/admin/receipts/sample" },
        { label: "EMI Payment Receipt" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <PrintActionBanner
        className="mb-4"
        title="Receipt Print / PDF"
        description="This sample demonstrates one-page EMI payment receipt output."
      />

      <PaymentReceiptDocument
        audienceLabel="Sample layout for customer handover after EMI collection."
        documentTitle="EMI Payment Receipt"
        receiptReference="RCPT-SB-2026-001089"
        paymentId={1089}
        statusLabel="PAID"
        statusToneClassName="border-emerald-200 bg-emerald-50 text-emerald-700"
        partyFields={[
          { label: "Customer", value: "Ms. Riya Ghosh", emphasize: true },
          { label: "Phone", value: "+91 90077 12233" },
          { label: "Subscription / Plan", value: "SUB-2026-0031", emphasize: true },
          { label: "Batch / Lucky ID", value: "APR-26-A / Lucky #42" },
        ]}
        referenceFields={[
          { label: "Payment Date", value: "19 Apr 2026" },
          { label: "Installment", value: "Month 5" },
          { label: "Payment Method", value: "UPI" },
          { label: "Payment Reference", value: "UPI/REF/4419022218" },
        ]}
        summaryFields={[
          { label: "Amount Paid", value: toSafeMoney(3500), emphasize: true },
          { label: "Collected By", value: "Cashier / SB-Counter-1" },
          { label: "Verified By", value: "Admin Supervisor" },
          { label: "Receipt Status", value: "PAID" },
        ]}
        detailFields={[
          { label: "Plan Name", value: "Lucky Plan EMI" },
          { label: "Product", value: "Royal Dining Set" },
          { label: "Batch", value: "APR-26-A" },
          { label: "Lucky ID", value: "#42" },
          { label: "Cashier", value: "SB-Counter-1" },
          { label: "Partner", value: "—" },
        ]}
        footerNote="Thank you for your payment. Keep this receipt for subscription and payment reference."
      />
    </ERPPageShell>
  );
}
