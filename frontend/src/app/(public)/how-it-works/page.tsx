import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import ProcessTimeline from "@/components/public/ProcessTimeline";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import {
  HOW_IT_WORKS_JOURNEY_A,
  HOW_IT_WORKS_JOURNEY_B,
  HOW_IT_WORKS_JOURNEY_C,
  HOW_IT_WORKS_JOURNEY_D,
  HOW_IT_WORKS_JOURNEY_E,
  PUBLIC_LEGAL_DISCLAIMER_POINTS,
} from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "How It Works",
  description:
    "Step-by-step guide covering all five customer journeys at Subidha Furniture — Advance EMI (Lucky Plan), Rent, Lease, Payment & Receipt, and Delivery Readiness.",
  path: "/how-it-works",
});

const journeys = [
  {
    id: "advance-emi",
    label: "A",
    eyebrow: "Journey A — Advance EMI",
    title: "Advance EMI / Lucky Plan",
    description:
      "From product selection and customer registration through Lucky ID assignment, monthly EMI payments, draw participation, and delivery. Winning is not guaranteed. Winner benefit is future EMI waiver only.",
    steps: HOW_IT_WORKS_JOURNEY_A,
  },
  {
    id: "rent",
    label: "B",
    eyebrow: "Journey B — Rent",
    title: "Rent contract journey",
    description:
      "Flexible product usage under a rent contract. Deposit and monthly demand are separate. No Lucky ID. Delivery, return, and service governed by terms.",
    steps: HOW_IT_WORKS_JOURNEY_B,
  },
  {
    id: "lease",
    label: "C",
    eyebrow: "Journey C — Lease",
    title: "Lease contract journey",
    description:
      "Longer-term product usage under an approved lease. No Lucky ID. Deposit and monthly lease charges are separate liabilities. Renewal and upgrade require admin approval.",
    steps: HOW_IT_WORKS_JOURNEY_C,
  },
  {
    id: "payment",
    label: "D",
    eyebrow: "Journey D — Payments",
    title: "Payment and receipt journey",
    description:
      "How payments are recorded, receipts are generated, and proof is preserved. Customers cannot self-post payments. Every valid payment must generate an official receipt.",
    steps: HOW_IT_WORKS_JOURNEY_D,
  },
  {
    id: "delivery",
    label: "E",
    eyebrow: "Journey E — Delivery",
    title: "Delivery readiness journey",
    description:
      "How KYC, contract, payment, stock, and operational readiness combine before delivery is authorised. The backend system remains authoritative for all delivery decisions.",
    steps: HOW_IT_WORKS_JOURNEY_E,
  },
] as const;

export default function HowItWorksPage() {
  return (
    <PublicPageShell
      title="How It Works"
      subtitle="Five customer journeys explained step by step — Advance EMI (Lucky Plan), Rent, Lease, Payment & Receipt, and Delivery Readiness."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "How it works" },
      ]}
      hero={{
        eyebrow: "Customer education",
        badges: ["Advance EMI", "Rent", "Lease", "Payments", "Delivery"],
      }}
      actions={[
        { label: "View Contracts", href: ROUTES.public.contracts, variant: "secondary" },
        { label: "Read Rulebook", href: ROUTES.public.rulebook, variant: "secondary" },
      ]}
    >
      <div className="rounded-[1.5rem] border border-amber-200/70 bg-amber-50/60 px-5 py-4 text-sm leading-6 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
        <strong className="font-semibold">Important: </strong>
        This page explains all five customer journeys in plain language. Final rights and
        obligations are governed by your approved contract, receipt records, and official policy
        documents. Advance EMI / Lucky Plan participation does not guarantee winning.
      </div>

      <nav
        aria-label="Journey sections"
        className="flex flex-wrap gap-2"
      >
        {journeys.map((journey) => (
          <a
            key={journey.id}
            href={`#${journey.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_88%,transparent)] px-4 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-bold text-foreground">
              {journey.label}
            </span>
            {journey.title}
          </a>
        ))}
      </nav>

      {journeys.map((journey) => (
        <section key={journey.id} id={journey.id} className="space-y-4 scroll-mt-24">
          <SectionHeader
            eyebrow={journey.eyebrow}
            title={journey.title}
            description={journey.description}
          />
          <ProcessTimeline steps={journey.steps} />
        </section>
      ))}

      <PublicMarketingBanner
        eyebrow="Draw transparency"
        title="Commit-then-reveal draw process"
        description="The monthly Lucky Plan draw uses a commit-then-reveal mechanism. A commitment hash is published before the draw; the reveal is published afterward and can be verified. No public action can change a revealed result."
        items={[
          {
            title: "Commitment hash published first",
            description: "Before each draw, a hash commitment is published so the result cannot be changed after commitment.",
          },
          {
            title: "Reveal verified against commitment",
            description: "The actual draw result is published later and can be checked against the earlier commitment for transparency.",
          },
          {
            title: "Winner benefit is future EMI waiver only",
            description: "If your Lucky ID wins, future remaining EMI may be waived from the approved winning month. Past paid EMI is not refunded.",
          },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Rent and lease"
        title="No Lucky ID for Rent or Lease"
        description="Rent and lease are completely separate contract types. They do not participate in the monthly Lucky Plan draw, carry no EMI waiver benefit, and do not assign Lucky IDs."
        items={[
          {
            title: "Rent — flexible monthly usage",
            description: "Monthly demand and refundable deposit are separate. Product stays business property. Return inspection governs deposit refund.",
          },
          {
            title: "Lease — longer-term contract",
            description: "Extended tenure with deposit and monthly lease charges. Renewal and upgrade require admin approval.",
          },
          {
            title: "Both governed by contract terms",
            description: "Final obligations for rent and lease are determined by the signed contract, receipt records, and inspection outcome.",
          },
        ]}
      />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Ready to understand your options?"
        description="Browse contracts, read the rulebook, or contact the branch for a plain-language explanation of which plan suits you."
        actions={[
          { href: ROUTES.public.contracts, label: "Explore Contracts", variant: "secondary" },
          { href: ROUTES.public.rulebook, label: "Read Rulebook", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact Store", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
