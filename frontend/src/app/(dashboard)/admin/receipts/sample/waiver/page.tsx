"use client";

import WaiverBenefitReceiptDocument from "@/components/receipts/WaiverBenefitReceiptDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { toSafeMoney } from "@/lib/print/formatters";

export default function SampleWaiverReceiptPage() {
  return (
    <ERPPageShell
      className="receipt-print-page"
      title="Sample Waiver / Lucky Draw Benefit Receipt"
      subtitle="Future-EMI-only waiver confirmation document for winner communication."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples", href: "/admin/receipts/sample" },
        { label: "Waiver Benefit Receipt" },
      ]}
    >
      <PrintActionBanner
        className="mb-4"
        title="Waiver Receipt Print / PDF"
        description="Print this format for customer waiver confirmation."
      />

      <WaiverBenefitReceiptDocument
        referenceNumber="WVR-2026-00031"
        issueDate="19 Apr 2026"
        customerFields={[
          { label: "Customer", value: "Mr. Arup Dey", emphasize: true },
          { label: "Phone", value: "+91 93300 77882" },
          { label: "Subscription Ref", value: "SUB-2026-0029", emphasize: true },
          { label: "Batch / Lucky ID", value: "APR-26-A / #08" },
        ]}
        waiverFields={[
          { label: "Winner Month", value: "Month 9" },
          { label: "Waiver Scope", value: "Future EMI Waiver Only", emphasize: true },
          { label: "Applicable Installments", value: "Month 10 to Month 24" },
          { label: "Issue Authority", value: "Admin Lucky Draw Desk" },
        ]}
        waiverSummaryFields={[
          { label: "Waived Installments", value: "15" },
          { label: "Waived Amount", value: toSafeMoney(52500), emphasize: true },
        ]}
      />
    </ERPPageShell>
  );
}

