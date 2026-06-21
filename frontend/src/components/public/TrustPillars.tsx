import { BookOpen, CheckCircle, FileText, ReceiptText, ShieldCheck, Smartphone } from "lucide-react";

import ScrollRevealSection from "@/components/public/ScrollRevealSection";
import { cn } from "@/lib/utils";

const pillars = [
  {
    icon: ReceiptText,
    title: "Every payment gets a receipt",
    description:
      "Unlike a paper register entry that can be erased or disputed, each payment in Subidha CORE generates a traceable receipt. You can view your payment receipts from your customer dashboard.",
    badge: "Auditable",
  },
  {
    icon: FileText,
    title: "Contract-backed monthly schedule",
    description:
      "Your EMI schedule is derived from the approved contract value and tenure — not from an informal note or verbal commitment. The monthly amount is clear before you enroll.",
    badge: "Transparent",
  },
  {
    icon: ShieldCheck,
    title: "Winner draw is verifiable",
    description:
      "Lucky draw results come from a commit-then-reveal process. The commitment hash is published before the draw, and the reveal is published afterward. No result can be secretly altered after commitment.",
    badge: "Verifiable",
  },
  {
    icon: BookOpen,
    title: "Public rule reference",
    description:
      "Plan rules, rent/lease terms, delivery policies, and payment safeguards are all published on this site. You can read them before committing. No surprises after enrollment.",
    badge: "Open rules",
  },
  {
    icon: Smartphone,
    title: "Customer portal visibility",
    description:
      "After login, customers can see their own subscriptions, payment history, Lucky ID assignments, delivery status, and support requests — all in one place.",
    badge: "Self-service",
  },
  {
    icon: CheckCircle,
    title: "Delivery needs your confirmation",
    description:
      "Delivery and handover are treated as separate workflow steps. Documents are generated at handover so both customer and business have proof of the delivery event.",
    badge: "Documented",
  },
] as const;

type TrustPillarsProps = {
  className?: string;
};

export default function TrustPillars({ className }: TrustPillarsProps) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-6 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.62)]",
        className
      )}
    >
      <div className="mb-6 space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          Why digital over paper
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Safer, more transparent than a paper register
        </h2>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Traditional informal EMI systems rely on paper notebooks that can be lost, altered, or disputed.
          Subidha CORE keeps every record digital, receipted, and auditable.
        </p>
      </div>

      <ScrollRevealSection stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {pillars.map((pillar) => (
          <article
            key={pillar.title}
            className="scroll-reveal-item-scale public-card public-card-animated p-5"
          >
            <div className="flex items-start gap-3">
              <span
                className="trust-pillar-icon inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--primary)_13%,var(--surface-card-elevated)_87%)] text-primary shadow-[inset_0_1px_0_var(--hairline-shine)]"
                aria-hidden="true"
              >
                <pillar.icon className="h-5 w-5" />
              </span>
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-[color-mix(in_oklab,var(--primary)_8%,white)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                {pillar.badge}
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">{pillar.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{pillar.description}</p>
          </article>
        ))}
      </ScrollRevealSection>
    </section>
  );
}
