"use client";

import BillingPrintDocument from "@/components/print/BillingPrintDocument";
import PrintActionBanner from "@/components/print/PrintActionBanner";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { toAmountInWordsINR, toSafeMoney } from "@/lib/print/formatters";

const sampleLineItems = [
  {
    description: "Berlin 4-Seater Sofa Set",
    quantity: 1,
    unitPrice: toSafeMoney(54500),
    lineTotal: toSafeMoney(54500),
  },
  {
    description: "Center Table - Oak Finish",
    quantity: 1,
    unitPrice: toSafeMoney(8500),
    lineTotal: toSafeMoney(8500),
  },
];

const subTotal = 63000;
const discount = 2500;
const total = subTotal - discount;
const received = 20000;
const balance = total - received;

export default function SampleInvoicePage() {
  return (
    <ERPPageShell
      className="receipt-print-page"
      title="Sample Invoice / Bill"
      subtitle="Branded customer-safe invoice preview for print and PDF output."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples", href: "/admin/receipts/sample" },
        { label: "Invoice / Bill" },
      ]}
    >
      <PrintActionBanner
        className="mb-4"
        title="Invoice Print / PDF"
        description="Use browser print to produce an A4-ready invoice PDF."
      />

      <BillingPrintDocument
        title="Retail Invoice"
        subtitle="Official customer invoice for delivered and billed products."
        reference="INV-SB-2026-00421"
        meta="Issue Date 19 Apr 2026"
        statusLabel="POSTED"
        statusToneClassName="border-emerald-200 bg-emerald-50 text-emerald-700"
        partyFields={[
          { label: "Customer", value: "Mr. Ayan Saha", emphasize: true },
          { label: "Phone", value: "+91 98765 43210" },
          { label: "Billing Address", value: "SB Gorai Road, Asansol" },
          { label: "Branch", value: "Subidha Asansol Main Branch" },
        ]}
        referenceFields={[
          { label: "Invoice Number", value: "INV-SB-2026-00421", emphasize: true },
          { label: "Invoice Date", value: "19 Apr 2026" },
          { label: "Due Date", value: "25 Apr 2026" },
          { label: "Payment Reference", value: "UPI/REF/44810298271" },
        ]}
        summaryFields={[
          { label: "Sub Total", value: toSafeMoney(subTotal) },
          { label: "Discount", value: toSafeMoney(discount) },
          { label: "Total Amount", value: toSafeMoney(total), emphasize: true },
          { label: "Received Amount", value: toSafeMoney(received) },
          { label: "Balance Due", value: toSafeMoney(balance), emphasize: true },
        ]}
        paymentFields={[
          { label: "Received By", value: "Counter SB-1" },
          { label: "Payment Mode", value: "UPI + Cash" },
          { label: "Reference", value: "UPI/REF/44810298271" },
          { label: "Collection Date", value: "19 Apr 2026" },
        ]}
        bankFields={[
          { label: "Bank", value: "State Bank of India" },
          { label: "A/C Suffix", value: "XXXX-2841" },
          { label: "IFSC", value: "SBIN0000123" },
          { label: "UPI ID", value: "subidhafurniture@upi" },
        ]}
        qrLabel="Scan For Transfer"
        qrReference="UPI: subidhafurniture@upi"
        detailFields={[
          { label: "Amount In Words", value: toAmountInWordsINR(total) },
          { label: "Terms", value: "Goods once sold will be serviced as per policy." },
          { label: "Document Type", value: "Customer Copy" },
          { label: "Prepared By", value: "Counter Billing Desk" },
        ]}
        lineItems={sampleLineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        }))}
      />
    </ERPPageShell>
  );
}
