import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPolicySection from "@/components/public/PublicPolicySection";
import PublicPageShell from "@/components/public/PublicPageShell";
import { ADVANCE_EMI_POLICY, LUCKY_PLAN_FAQ, PUBLIC_LEGAL_DISCLAIMER_POINTS, READ_BEFORE_APPLY } from "@/lib/public-content";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Lucky Plan",
  description: "Understand batches, Lucky IDs, EMI payments, winner publication, and future EMI waiver rules.",
  path: "/lucky-plan",
});

export default async function LuckyPlanPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return (
    <PublicPageShell
      title={dictionary.common.luckyPlan}
      subtitle="Join a batch, receive a Lucky ID, pay monthly EMI, and follow transparent winner publication. Draws are run under published rules; participation does not guarantee a prize, and any waiver applies only to future EMI obligations as described in branch documents."
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
        description="Winning waives remaining future EMI obligations only; already paid EMI stays recorded and valid."
        items={[
          { title: "Deterministic schedule", description: "EMI schedule remains reproducible and auditable." },
          { title: "Transparent draw workflow", description: "Published winner records come from reveal events only." },
          { title: "No hidden retroactive edits", description: "Settled payment history is never silently rewritten." },
        ]}
      />

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
        description="Published winner records include batch, draw month/date, lucky ID, and commitment proof hash where available. Winner names are masked."
        items={[
          { title: "Batch + draw context", description: "Each published winner row is tied to the exact batch and draw month." },
          { title: "Proof hash visibility", description: "Commit/reveal proof references are shown when available." },
          { title: "Masked identity", description: "Winner names are masked on public pages for privacy." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Operations clarity"
        title="Payment safety and delivery flow"
        description="Receipt records and delivery tracking are visible in customer self-service without changing contract or reconciliation behavior."
        items={[
          { title: "Receipt-first payments", description: "Collected payments are receipted and visible in customer payment/receipt pages." },
          { title: "Delivery as separate workflow", description: "Delivery status is tracked separately from EMI and contract state." },
          { title: "Warranty and return guidance", description: "Applicable return/warranty support is handled through documented policy and support flow." },
        ]}
      />

      <FaqBlock items={LUCKY_PLAN_FAQ} />

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Talk to the branch before you enroll"
        description="Get help on product selection, batch availability, tenure, and monthly amount comfort."
        actions={[
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.fairDraw, label: "View fair draw", variant: "secondary" },
          { href: ROUTES.public.products, label: "View Products", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
