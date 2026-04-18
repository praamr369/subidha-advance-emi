import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import ProcessTimeline from "@/components/public/ProcessTimeline";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { HOW_IT_WORKS_STEPS } from "@/lib/public-content";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "A step-by-step explanation of Lucky Plan: choose furniture, join a batch, receive a Lucky ID, pay EMI, and view transparent monthly winner publication.",
};

export default function HowItWorksPage() {
  return (
    <PublicPageShell
      title="How It Works"
      subtitle="A transparent, step-by-step view of the Lucky Plan journey from product selection through monthly EMI and published winner outcomes."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "How it works" },
      ]}
      actions={[
        { label: "Browse products", href: ROUTES.public.products, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="space-y-4">
        <SectionHeader
          eyebrow="Timeline"
          title="The 6-step Lucky Plan journey"
          description="Designed to keep product choice, batch participation, payment history, and draw publication understandable."
        />
        <ProcessTimeline steps={HOW_IT_WORKS_STEPS} />
      </section>

      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Fairness"
          title="Fairness and transparency (commit–reveal)"
          description="Explained simply, without cryptography jargon."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Commitment first
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              A commitment is published first as a SHA-256 hash. Think of it like a sealed envelope: it proves something was decided earlier without revealing it immediately.
            </p>
          </div>
          <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Reveal later
            </div>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              The reveal is published later. The system can verify that the reveal matches the earlier commitment, supporting deterministic winner selection and public trust.
            </p>
          </div>
        </div>
        <div className="mt-5 rounded-[1.6rem] border border-amber-200/80 bg-amber-50/80 px-5 py-4 text-sm leading-7 text-amber-900 shadow-[0_18px_50px_-40px_rgba(120,53,15,0.25)]">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            Winner benefit rule stays the same
          </div>
          <p className="mt-2">
            Winning waives remaining future EMI only. EMI already paid remains valid and is not refunded.
          </p>
        </div>
      </section>

      <CtaBanner
        title="Want to see published winners?"
        description="View the latest winner and winner history sourced from revealed draw records. If no records are published yet, the public site shows an honest empty state."
        actions={[
          { href: ROUTES.public.winners, label: "Winners", variant: "primary" },
          { href: ROUTES.public.winnerHistory, label: "Winner History", variant: "secondary" },
        ]}
      />
    </PublicPageShell>
  );
}
