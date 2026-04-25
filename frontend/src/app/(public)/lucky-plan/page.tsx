import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
<<<<<<< ours
<<<<<<< ours
=======
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
>>>>>>> theirs
import PublicPageShell from "@/components/public/PublicPageShell";
import { LUCKY_PLAN_FAQ } from "@/lib/public-content";
<<<<<<< ours
import { buildPublicMetadata, getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "Lucky Plan | Easy Monthly Plan for Furniture and Appliances",
    description: "Understand batches, Lucky IDs, EMI schedule, winner benefits, and transparent Lucky Plan rules.",
    path: "/lucky-plan",
  });
}
=======
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

=======
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { LUCKY_PLAN_FAQ } from "@/lib/public-content";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

>>>>>>> theirs
export const metadata: Metadata = buildPublicMetadata({
  title: "Lucky Plan",
  description: "Understand batches, Lucky IDs, EMI payments, winner publication, and future EMI waiver rules.",
  path: "/lucky-plan",
});
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs

export default async function LuckyPlanPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return (
    <PublicPageShell
<<<<<<< ours
<<<<<<< ours
      title={dictionary.common.luckyPlan}
      subtitle="Join a batch, receive a Lucky ID, pay monthly EMI, and follow transparent winner publication."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.luckyPlan },
      ]}
=======
      title="Lucky Plan"
      subtitle="A simple and transparent monthly purchase flow: choose product, join batch, pay EMI, and track published winners."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "Lucky Plan" }]}
>>>>>>> theirs
=======
      title="Lucky Plan"
      subtitle="A simple and transparent monthly purchase flow: choose product, join batch, pay EMI, and track published winners."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "Lucky Plan" }]}
>>>>>>> theirs
      actions={[
        { label: dictionary.common.howItWorks, href: ROUTES.public.howItWorks, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
<<<<<<< ours
<<<<<<< ours
      <section className="public-surface p-6">
        <SectionHeader eyebrow="Lucky Plan" title="Simple and transparent for families" description="Winner benefit is future EMI waiver only. Paid EMI stays in payment history." />
      </section>
      <FaqBlock items={LUCKY_PLAN_FAQ} />
      <CtaBanner title="Ready to start your plan?" description="Pick a product and submit an enquiry for branch follow-up." actions={[{ href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" }, { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" }]} />
=======
=======
>>>>>>> theirs
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
          { href: ROUTES.public.contact, label: "Contact us", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Apply now", variant: "primary" },
        ]}
      />
>>>>>>> theirs
    </PublicPageShell>
  );
}
