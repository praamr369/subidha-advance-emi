"use client";

import SubscriptionContractDocument from "@/components/print/SubscriptionContractDocument";
import SubscriptionBookingReceiptDocument from "@/components/receipts/SubscriptionBookingReceiptDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import PortalPage from "@/components/ui/PortalPage";
import { toSafeMoney } from "@/lib/print/formatters";

export default function SampleSubscriptionDocumentsPage() {
  return (
    <PortalPage
      className="receipt-print-page"
      title="Sample Subscription Booking + Plan Summary"
      subtitle="Customer-facing enrollment receipt and contract-style plan summary preview."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples", href: "/admin/receipts/sample" },
        { label: "Subscription Documents" },
      ]}
    >
      <PrintActionBanner
        className="mb-4"
        title="Subscription Print / PDF"
        description="Print either document block as one-page customer copies."
      />

      <SubscriptionBookingReceiptDocument
        receiptReference="SUB-BOOK-2026-00078"
        issuedOn="19 Apr 2026"
        customerFields={[
          { label: "Customer", value: "Mr. Sayan Mukherjee", emphasize: true },
          { label: "Phone", value: "+91 98300 44221" },
          { label: "Branch", value: "Subidha Asansol Main Branch" },
          { label: "Operator", value: "Admin Desk" },
        ]}
        enrollmentFields={[
          { label: "Plan Name", value: "Lucky Plan EMI" },
          { label: "Product", value: "Premium Bedroom Set", emphasize: true },
          { label: "Batch", value: "APR-26-B" },
          { label: "Lucky ID", value: "#19", emphasize: true },
          { label: "Tenure", value: "24 months" },
          { label: "Plan Type", value: "EMI" },
        ]}
        amountFields={[
          { label: "Total Contract Value", value: toSafeMoney(84000), emphasize: true },
          { label: "Monthly EMI", value: toSafeMoney(3500), emphasize: true },
          { label: "Booking Amount", value: toSafeMoney(7000) },
          { label: "Outstanding", value: toSafeMoney(77000) },
        ]}
        acknowledgementLines={[
          "This document confirms the subscription booking details recorded at branch counter.",
          "All payment, waiver, and draw outcomes remain traceable in canonical records.",
        ]}
      />

      <div className="my-3 border-t border-dashed border-slate-300" />

      <SubscriptionContractDocument
        audienceLabel="Plan summary print view for customer understanding and branch filing."
        contractReference="SUB-2026-00078"
        subscriptionId={78}
        statusLabel="ACTIVE"
        statusToneClassName="border-emerald-200 bg-emerald-50 text-emerald-700"
        issuedOn="19 Apr 2026"
        customerFields={[
          { label: "Customer", value: "Mr. Sayan Mukherjee", emphasize: true },
          { label: "Phone", value: "+91 98300 44221" },
          { label: "Product", value: "Premium Bedroom Set", emphasize: true },
          { label: "Product Code", value: "BED-PREM-04" },
        ]}
        contractFields={[
          { label: "Plan Type", value: "Lucky Plan EMI" },
          { label: "Tenure", value: "24 month(s)" },
          { label: "Batch", value: "APR-26-B" },
          { label: "Lucky Number", value: "#19" },
          { label: "Start Date", value: "19 Apr 2026" },
          { label: "Benefit Rule", value: "Winner benefit applies to future EMI waiver only" },
        ]}
        financialFields={[
          { label: "Total Contract Value", value: toSafeMoney(84000), emphasize: true },
          { label: "Monthly Installment", value: toSafeMoney(3500), emphasize: true },
          { label: "Paid Amount", value: toSafeMoney(7000) },
          { label: "Waived Amount", value: toSafeMoney(0) },
          { label: "Outstanding", value: toSafeMoney(77000), emphasize: true },
        ]}
        terms={[
          "This summary is generated from active subscription data.",
          "Winner benefit applies only to future eligible EMI obligations.",
          "Past paid installments are not altered by winner waiver events.",
        ]}
      />
    </PortalPage>
  );
}

