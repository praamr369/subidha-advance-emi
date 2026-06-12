import { CheckCircle2, EyeOff, FileSearch, ShieldCheck } from "lucide-react";

const evidenceCards = [
  {
    icon: FileSearch,
    title: "What is shown publicly",
    points: [
      "Batch code and draw month when available.",
      "Masked winner display name.",
      "Lucky ID or lucky number if the public API returns it.",
      "Commitment hash and verification status when published.",
    ],
  },
  {
    icon: EyeOff,
    title: "What is never shown publicly",
    points: [
      "Phone number, address, KYC IDs, and private documents.",
      "Internal customer IDs and staff-only workflow notes.",
      "Private financial ledger lines or reconciliation evidence.",
      "Unpublished draw drafts or non-revealed private data.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "What public pages cannot do",
    points: [
      "They cannot select or change a winner.",
      "They cannot assign Lucky IDs or create subscriptions.",
      "They cannot waive EMI or reverse payment history.",
      "They cannot create receipts, invoices, or accounting records.",
    ],
  },
] as const;

export default function DrawEvidenceExplainer() {
  return (
    <section className="public-surface p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Evidence boundary</div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">How to read public draw records</h2>
      <p className="mt-3 max-w-4xl text-sm leading-7 text-muted-foreground sm:text-base">
        Public draw pages explain revealed records without exposing private customer or internal financial data. Operational truth stays in the authenticated system.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {evidenceCards.map((card) => (
          <article key={card.title} className="public-card public-card-animated p-5">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]">
              <card.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{card.title}</h3>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
              {card.points.map((point) => (
                <li key={point} className="flex gap-2 rounded-xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_76%,transparent)] px-3 py-2">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
