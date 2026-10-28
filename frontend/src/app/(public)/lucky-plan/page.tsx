import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import EmiJourneyTimeline from "@/components/public/EmiJourneyTimeline";
import FaqBlock from "@/components/public/FaqBlock";
import LuckyPlanAnimatedHero from "@/components/public/LuckyPlanAnimatedHero";
import LuckyPlanMechanicsPreview from "@/components/public/LuckyPlanMechanicsPreview";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ADVANCE_EMI_POLICY, FULL_PUBLIC_FAQ, PUBLIC_LEGAL_DISCLAIMER_POINTS, READ_BEFORE_APPLY } from "@/lib/public-content";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Subidha EMI (SFEMI)",
  description: "Understand Advance EMI payments, product terms, customer benefits, and clear eligibility rules.",
  path: "/lucky-plan",
});

export default async function LuckyPlanPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  const subtitle =
    "Join the Subidha EMI (SFEMI) promotional Advance EMI program, pay the agreed monthly installment, and receive benefits only under the published product terms. SFEMI is a product purchase arrangement, not an investment or guaranteed return.";

  return (
    <PublicPageShell
      title={dictionary.common.luckyPlan}
      subtitle={subtitle}
      heroSlot={<LuckyPlanAnimatedHero title={dictionary.common.luckyPlan} subtitle={subtitle} />}
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.luckyPlan },
      ]}
      actions={[
        { label: dictionary.common.howItWorks, href: ROUTES.public.howItWorks, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Plan benefits"
        title="Easy monthly plan with clear financial boundaries"
        description="Any promotional benefit applies only as stated in the signed SFEMI terms; already paid EMI remains recorded and valid. This page explains the product and does not create contracts or alter ledgers."
        items={[
          { title: "Deterministic schedule", description: "EMI schedule remains reproducible and auditable." },
          { title: "Clear promotional terms", description: "Eligibility and benefits follow the published SFEMI terms." },
          { title: "No hidden retroactive edits", description: "Settled payment history is never silently rewritten." },
        ]}
      />

      <LuckyPlanMechanicsPreview />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="SFEMI enrollment"
          title="Structured enrollment and contract records"
          description="Availability, tenure, and installment terms are confirmed by the branch before enrollment."
        />
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
        eyebrow="Customer protection"
        title="Clear records with privacy protection"
        description="Customer contracts, receipts, eligibility, and benefit records are handled through documented business processes. Public pages do not expose private customer or financial information."
        items={[
          { title: "Contract context", description: "Product, tenure, and installment terms are recorded against the contract." },
          { title: "Receipt visibility", description: "Customers can access their own payment receipts through the portal." },
          { title: "Masked identity", description: "Private customer information is protected on public pages." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Operations clarity"
        title="Payment safety and delivery flow"
        description="Receipt records and delivery tracking are visible in customer self-service without changing contract or reconciliation behavior. SFEMI public content remains separate from operational posting."
        items={[
          { title: "Receipt-first payments", description: "Collected payments are receipted and visible in customer payment/receipt pages." },
          { title: "Delivery as separate workflow", description: "Delivery status is tracked separately from EMI and contract state." },
          { title: "Warranty and return guidance", description: "Applicable return/warranty support is handled through documented policy and support flow." },
        ]}
      />

      <FaqBlock items={FULL_PUBLIC_FAQ.slice(0, 7)} />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Talk to the branch before you enroll"
        description="Get help on product selection, batch availability, tenure, and monthly amount comfort."
        actions={[
          { href: ROUTES.public.rulebook, label: "View Rulebook", variant: "secondary" },
          { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
          { href: ROUTES.public.faq, label: "Read SFEMI FAQ", variant: "secondary" },
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
