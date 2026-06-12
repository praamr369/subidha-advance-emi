import { CheckCircle2, ClipboardCheck, PackageCheck, ReceiptText, ShieldCheck } from "lucide-react";

const workflowCards = [
  {
    icon: PackageCheck,
    title: "Catalogue discovery",
    description: "Product detail pages show published product records and media only. They do not expose internal inventory allocation.",
  },
  {
    icon: ClipboardCheck,
    title: "Branch confirmation",
    description: "Staff confirm stock posture, plan fit, documents, customer details, monthly comfort, and delivery expectation.",
  },
  {
    icon: ReceiptText,
    title: "Controlled records",
    description: "Contracts, payments, receipts, invoices, deposits, handover, and accounting records stay inside authenticated workflows.",
  },
] as const;

const readBeforeEnquiry = [
  "Product images and descriptions are public catalogue content only.",
  "Catalogue base price is not a final contract, EMI, rent, lease, or invoice amount.",
  "Submitting enquiry does not create a customer contract or financial record.",
  "Winner waiver, rent/lease deposit, direct-sale receipt, and delivery proof remain backend-controlled.",
] as const;

export default function ProductDetailWorkflowBoundary() {
  return (
    <section className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-3">
        {workflowCards.map((card) => (
          <article key={card.title} className="public-card-sm public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <card.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-foreground">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
          </article>
        ))}
      </section>

      <section className="public-surface p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Read before product enquiry
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {readBeforeEnquiry.map((point) => (
            <div key={point} className="flex gap-2 rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_76%,transparent)] px-4 py-3 text-sm leading-6 text-muted-foreground">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>{point}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
