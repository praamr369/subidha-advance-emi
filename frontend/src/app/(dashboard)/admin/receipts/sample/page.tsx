"use client";

import ActionButton from "@/components/ui/ActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";

const SAMPLE_LINKS = [
  {
    href: "/admin/receipts/sample/invoice",
    label: "Invoice / Bill",
    description: "Customer-facing invoice preview with item lines, totals, and signature blocks.",
  },
  {
    href: "/admin/receipts/sample/payment",
    label: "EMI Payment Receipt",
    description: "Payment receipt preview for cashier/customer handover.",
  },
  {
    href: "/admin/receipts/sample/subscription",
    label: "Subscription Booking + Plan Summary",
    description: "Enrollment receipt and subscription summary document preview.",
  },
  {
    href: "/admin/receipts/sample/acknowledgement",
    label: "Payment Acknowledgement Slip",
    description: "Compact acknowledgement slip for received payment proof.",
  },
  {
    href: "/admin/receipts/sample/waiver",
    label: "Waiver / Lucky Draw Benefit",
    description: "Winner waiver benefit receipt using future-EMI-only language.",
  },
];

export default function AdminReceiptSampleIndexPage() {
  return (
    <ERPPageShell
      className="receipt-print-page"
      eyebrow="Billing"
      title="Document Sample Previews"
      subtitle="Review the branded receipt/document family before or alongside route-level backend wiring."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Receipt Samples" },
      ]}
    >
      <section className="grid gap-3 md:grid-cols-2">
        {SAMPLE_LINKS.map((item) => (
          <div key={item.href} className="rounded-xl border border-slate-300 bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">{item.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            <div className="mt-3">
              <ActionButton href={item.href} variant="secondary">
                Open Preview
              </ActionButton>
            </div>
          </div>
        ))}
      </section>
    </ERPPageShell>
  );
}
