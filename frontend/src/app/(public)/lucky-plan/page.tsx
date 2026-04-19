import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
import PlanCategoryShowcase from "@/components/public/PlanCategoryShowcase";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { LUCKY_PLAN_FAQ } from "@/lib/public-content";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Lucky Plan",
  description:
    "Understand Lucky Plan at Subidha Furniture: batches, Lucky IDs, monthly EMI structure, monthly winners, and the future EMI waiver rule.",
};

export default function LuckyPlanPage() {
  return (
    <PublicPageShell
      title="Lucky Plan"
      subtitle="A structured monthly purchase plan with batch-based participation, Lucky IDs (00–99), and transparent winner publication. Winning waives future EMI only."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Lucky Plan" },
      ]}
      actions={[
        { label: "How it works", href: ROUTES.public.howItWorks, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="public-surface grid gap-6 p-6 lg:grid-cols-2">
        <div className="public-card p-6">
          <SectionHeader
            eyebrow="Overview"
            title="What the Lucky Plan is"
            description="A structured plan for purchasing furniture with predictable monthly EMI, plus a transparent monthly winner benefit."
          />
          <div className="mt-5 grid gap-2 text-sm leading-6 text-muted-foreground">
            <div className="public-card-sm px-4 py-3">
              Join a batch and receive a Lucky ID (00–99).
            </div>
            <div className="public-card-sm px-4 py-3">
              Pay monthly EMI on a clear schedule (typically a 15-month cycle).
            </div>
            <div className="public-card-sm px-4 py-3">
              One winner is selected per batch per month and published when revealed.
            </div>
            <div className="public-card-sm px-4 py-3">
              Winner benefit: waiver of remaining future EMI only.
            </div>
          </div>
        </div>

        <div className="public-card p-6">
          <SectionHeader
            eyebrow="Clear rule"
            title="Future EMI waiver only"
            description="Winning does not refund past EMI and does not rewrite payment history."
          />
          <div className="mt-5 grid gap-3">
            <div className="rounded-[1.6rem] border border-emerald-200/80 bg-emerald-50/80 px-5 py-4 text-sm leading-6 text-emerald-900 shadow-[0_18px_50px_-40px_rgba(6,95,70,0.35)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                What winning means
              </div>
              <p className="mt-2">
                Remaining future EMI obligations may be waived according to plan rules and eligibility.
              </p>
            </div>
            <div className="rounded-[1.6rem] border border-amber-200/80 bg-amber-50/80 px-5 py-4 text-sm leading-6 text-amber-900 shadow-[0_18px_50px_-40px_rgba(120,53,15,0.25)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                What does not happen
              </div>
              <p className="mt-2">
                EMI already paid remains valid and is not refunded. Past payment history stays recorded and auditable.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PlanCategoryShowcase />

      <section className="public-surface p-6">
        <SectionHeader
          eyebrow="Plan structure"
          title="Batches, Lucky IDs, and the monthly draw"
          description="The batch model keeps participation and winner publication consistent and explainable."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="public-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Typical tenure
            </div>
            <div className="mt-3 text-xl font-semibold text-foreground">15 months</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              EMI is structured across the tenure so monthly obligations stay predictable.
            </p>
          </div>
          <div className="public-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Lucky IDs
            </div>
            <div className="mt-3 text-xl font-semibold text-foreground">00–99</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Lucky IDs are assigned within a batch based on availability at enrollment.
            </p>
          </div>
          <div className="public-card p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Winner rhythm
            </div>
            <div className="mt-3 text-xl font-semibold text-foreground">
              One winner / batch / month
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Winner publication is based on revealed draw records to support transparency.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="FAQ"
          title="Common questions"
          description="Clear answers that match the real Lucky Plan operating rules."
        />
        <FaqBlock items={LUCKY_PLAN_FAQ} />
      </section>

      <CtaBanner
        title="Want to check product options first?"
        description="Browse the live catalogue, then submit an enquiry with your preferred product and EMI comfort so the branch can guide you on batch availability."
        actions={[
          { href: ROUTES.public.products, label: "Browse Products", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
