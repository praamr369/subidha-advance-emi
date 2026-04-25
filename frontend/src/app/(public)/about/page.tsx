import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { buildPublicMetadata, getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  return buildPublicMetadata({
    title: `${dictionary.nav.links[6]} | Subidha Furniture`,
    description: "Learn why local families trust Subidha Furniture for transparent Lucky Plan and easy monthly purchase support.",
    path: "/about",
  });
}

export default async function AboutPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  return (
    <PublicPageShell
      title={dictionary.nav.links[6]}
      subtitle="We are a local retail business helping families own furniture, electronics, and appliances through practical monthly plans."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.nav.links[6] },
      ]}
      actions={[
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Our commitment"
        title="Real local support with clear rules"
        description="We avoid fake statistics and demo claims. Public pages show either live records or honest empty states."
        items={[
          { title: "Family affordability", description: "Plans are presented in simple monthly terms." },
          { title: "Audit-friendly process", description: "Payment, winner, and contract states are kept transparent." },
          { title: "Branch accountability", description: "Enrollment and follow-up are handled by the local team." },
        ]}
      />

      <section className="rounded-[2rem] border border-white/75 bg-white/70 p-6">
        <SectionHeader
          eyebrow="Brand story"
          title="Built for daily retail reality"
          description="Subidha CORE supports actual retail operations, including customer onboarding, payment follow-up, and winner publication clarity."
        />
      </section>

      <CtaBanner
        title="Ready to explore current options?"
        description="See the public catalogue and contact the branch to check active batches and monthly plan comfort."
        actions={[
          { href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" },
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
