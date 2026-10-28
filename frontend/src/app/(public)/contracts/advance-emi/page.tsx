import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import EmiJourneyTimeline from "@/components/public/EmiJourneyTimeline";
import FaqBlock from "@/components/public/FaqBlock";
import LuckyIdGrid from "@/components/public/LuckyIdGrid";
import LuckyPlanAnimatedHero from "@/components/public/LuckyPlanAnimatedHero";
import LuckyPlanMechanicsPreview from "@/components/public/LuckyPlanMechanicsPreview";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ADVANCE_EMI_POLICY, FULL_PUBLIC_FAQ, PUBLIC_LEGAL_DISCLAIMER_POINTS, READ_BEFORE_APPLY } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "SFEMI Advance EMI Contract",
  description:
    "Full details of the SFEMI Advance EMI contract: SFEMI ID assignment, promotional eligibility, customer protections, and transparent terms.",
  path: "/contracts/advance-emi",
});

const subtitle =
  "Join an approved batch, receive an SFEMI ID, pay the agreed monthly EMI, and follow the published promotional terms. SFEMI is a product purchase arrangement, not an investment or guaranteed return.";

export default function ContractsAdvanceEmiPage() {
  return (
    <PublicPageShell
      title="SFEMI Advance EMI"
      subtitle={subtitle}
      heroSlot={<LuckyPlanAnimatedHero title="Advance EMI (Lucky Plan)" subtitle={subtitle} />}
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Contracts", href: ROUTES.public.contracts },
        { label: "Advance EMI" },
      ]}
      actions={[
        { label: "How it works", href: ROUTES.public.howItWorks, variant: "secondary" },
        { label: "Apply / Enquire", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Plan benefits"
        title="Easy monthly plan with clear financial boundaries"
        description="Winning waives remaining future EMI obligations only; already paid EMI stays recorded and valid. The public page explains the plan, but does not create contracts or alter ledgers."
        items={[
          { title: "Deterministic schedule", description: "EMI schedule remains reproducible and auditable." },
          { title: "Transparent draw workflow", description: "Published winner records come from reveal events only." },
          { title: "No hidden retroactive edits", description: "Settled payment history is never silently rewritten." },
        ]}
      />

      <LuckyPlanMechanicsPreview />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="SFEMI ID explained"
          title="The 00–99 batch slot grid"
          description="Each batch holds up to 100 numbered slots. This grid is for explanatory purposes only."
        />
        <LuckyIdGrid />
      </section>

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Full journey"
          title="The SFEMI Advance EMI journey — step by step"
        />
        <EmiJourneyTimeline />
      </section>

      <PublicDisclaimerBox title="Read before applying" points={READ_BEFORE_APPLY.advanceEmi} />

      <PublicPolicySection
        id="advance-emi-policy"
        title={ADVANCE_EMI_POLICY.title}
        intro={ADVANCE_EMI_POLICY.intro}
        cards={ADVANCE_EMI_POLICY.cards}
      />

      <PublicMarketingBanner
        eyebrow="Winner transparency"
        title="Public winner proof with privacy protection"
          description="Published SFEMI records include approved contract context and customer-safe information. Private customer details remain protected."
        items={[
          { title: "Batch + draw context", description: "Each published winner row is tied to the exact batch and draw month." },
          { title: "Proof hash visibility", description: "Commit/reveal proof references are shown when available." },
          { title: "Masked identity", description: "Winner names are masked on public pages for privacy." },
        ]}
      />

      <FaqBlock items={FULL_PUBLIC_FAQ.slice(0, 7)} />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Talk to the branch before you enroll"
        description="Get help on product selection, batch availability, tenure, and monthly amount comfort."
        actions={[
          { href: ROUTES.public.contracts, label: "View all contracts", variant: "secondary" },
          { href: ROUTES.public.rulebook, label: "View Rulebook", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact store", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply / Enquire", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
