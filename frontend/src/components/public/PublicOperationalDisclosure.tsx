import { ClipboardCheck, ReceiptText, ShieldCheck } from "lucide-react";

const disclosures = [
  {
    icon: ClipboardCheck,
    title: "Public pages are enquiry-first",
    description: "Browsing, applying, or selecting a product publicly does not create contracts, subscriptions, Lucky IDs, deposits, invoices, or receipts.",
  },
  {
    icon: ShieldCheck,
    title: "Branch review stays mandatory",
    description: "Stock, plan type, tenure, monthly amount, deposit posture, delivery, and documents require staff-controlled workflow.",
  },
  {
    icon: ReceiptText,
    title: "Financial records stay protected",
    description: "Payments, waivers, refunds, reconciliation, and accounting records remain inside authenticated operational systems.",
  },
] as const;

export default function PublicOperationalDisclosure() {
  return (
    <aside
      aria-label="Public site operational disclosure"
      className="mx-auto w-full max-w-[1280px] px-4 pb-8 sm:px-6 lg:px-8"
    >
      <div className="rounded-[2rem] border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_86%,transparent)] p-5 shadow-[0_24px_70px_-54px_rgba(87,54,31,0.54)] backdrop-blur">
        <div className="grid gap-4 md:grid-cols-3">
          {disclosures.map((item) => (
            <div key={item.title} className="flex gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_12%,var(--surface-card-elevated)_88%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
                <item.icon className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
