import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { LUCKY_PLAN_FAQ } from "@/lib/public-content";
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
      subtitle="Join a batch, receive a Lucky ID, pay monthly EMI, and follow transparent winner publication."
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

      <FaqBlock items={LUCKY_PLAN_FAQ} />

      <CtaBanner
        title="Talk to the branch before you enroll"
        description="Get help on product selection, batch availability, tenure, and monthly amount comfort."
        actions={[
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
