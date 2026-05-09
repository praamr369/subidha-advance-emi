import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicProcessTimeline from "@/components/public/PublicProcessTimeline";
import PublicPageShell from "@/components/public/PublicPageShell";
import { HOW_IT_WORKS_STEPS } from "@/lib/public-content";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "How It Works",
  description: "Step-by-step public explanation of Lucky Plan from product selection to winner publication.",
  path: "/how-it-works",
});

export default async function HowItWorksPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return (
    <PublicPageShell
      title={dictionary.common.howItWorks}
      subtitle="A simple 6-step journey for customers and families. Winning a draw is not assured—review Lucky Plan and policy pages for eligibility, tenure, and benefit scope."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.howItWorks },
      ]}
      actions={[
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicProcessTimeline steps={HOW_IT_WORKS_STEPS} />

      <PublicMarketingBanner
        eyebrow="Trust process"
        title="Commit first, reveal later"
        description="The draw process is designed for verifiable transparency while keeping explanation simple for customers."
        items={[
          { title: "Commitment", description: "A hash commitment is published before reveal." },
          { title: "Reveal", description: "The reveal is published later and verified against commitment." },
          { title: "Rule clarity", description: "Winner benefit applies only to future EMI obligations." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="After enrollment"
        title="Payment and delivery process"
        description="Customers can track scheduled EMI, receipts, contract documents, and delivery status from their own portal scope."
        items={[
          { title: "Payment safety", description: "Payments are receipted and appear in customer payment/receipt pages." },
          { title: "Delivery tracking", description: "Dispatch and handover states are shown in delivery pages." },
          { title: "Support continuity", description: "Warranty/return follow-ups move through support requests with audit history." },
        ]}
      />

      <CtaBanner
        title="See live winner records"
        description="Visit Winners and Winner History pages for published entries from revealed records only."
        actions={[
          { href: ROUTES.public.winners, label: dictionary.common.winners, variant: "primary" },
          { href: ROUTES.public.winnerHistory, label: dictionary.common.winnerHistory, variant: "secondary" },
          { href: ROUTES.public.policies, label: "Business policies", variant: "secondary" },
        ]}
      />
    </PublicPageShell>
  );
}
