import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import ProcessTimeline from "@/components/public/ProcessTimeline";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { HOW_IT_WORKS_STEPS } from "@/lib/public-content";
<<<<<<< ours
<<<<<<< ours
import { buildPublicMetadata, getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    title: "How Lucky Plan Works | Subidha Furniture",
    description: "Step-by-step guide to joining Lucky Plan, paying EMI, and understanding transparent winner publishing.",
    path: "/how-it-works",
  });
}
=======
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

=======
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

>>>>>>> theirs
export const metadata: Metadata = buildPublicMetadata({
  title: "How It Works",
  description: "Step-by-step public explanation of Lucky Plan from product selection to winner publication.",
  path: "/how-it-works",
});
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs

export default async function HowItWorksPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return (
    <PublicPageShell
<<<<<<< ours
<<<<<<< ours
      title={dictionary.common.howItWorks}
      subtitle="A simple 6-step journey for customers and families."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.howItWorks },
      ]}
=======
      title="How It Works"
      subtitle="A customer-friendly view of the end-to-end journey for furniture, electronics, and appliance purchases under Lucky Plan."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "How it works" }]}
>>>>>>> theirs
=======
      title="How It Works"
      subtitle="A customer-friendly view of the end-to-end journey for furniture, electronics, and appliance purchases under Lucky Plan."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "How it works" }]}
>>>>>>> theirs
      actions={[
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
<<<<<<< ours
<<<<<<< ours
      <section className="space-y-4">
        <SectionHeader eyebrow="Steps" title="From product selection to winner publication" description="Clear steps for non-technical customers." />
        <ProcessTimeline steps={HOW_IT_WORKS_STEPS} />
      </section>
      <CtaBanner title="Need guidance in your language?" description="Visit branch, call support, or send WhatsApp enquiry for quick assistance." actions={[{ href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" }, { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" }]} />
=======
=======
>>>>>>> theirs
      <ProcessTimeline steps={HOW_IT_WORKS_STEPS} />

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

      <CtaBanner
        title="See live winner records"
        description="Visit Winners and Winner History pages for published entries from revealed records only."
        actions={[
          { href: ROUTES.public.winners, label: "Winners", variant: "primary" },
          { href: ROUTES.public.winnerHistory, label: "Winner History", variant: "secondary" },
        ]}
      />
>>>>>>> theirs
    </PublicPageShell>
  );
}
