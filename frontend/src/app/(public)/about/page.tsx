import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
<<<<<<< ours
<<<<<<< ours
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
=======
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

=======
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";

>>>>>>> theirs
export const metadata: Metadata = buildPublicMetadata({
  title: "About",
  description: "Learn how Subidha Furniture supports affordable family shopping with transparent Lucky Plan operations.",
  path: "/about",
});
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs

  return (
    <PublicPageShell
<<<<<<< ours
<<<<<<< ours
      title={dictionary.nav.links[6]}
      subtitle="We are a local retail business helping families own furniture, electronics, and appliances through practical monthly plans."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.nav.links[6] },
      ]}
=======
      title="About Subidha Furniture"
      subtitle="A trusted local team helping families bring home furniture, electronics, and appliances through structured monthly plans."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "About" }]}
>>>>>>> theirs
=======
      title="About Subidha Furniture"
      subtitle="A trusted local team helping families bring home furniture, electronics, and appliances through structured monthly plans."
      breadcrumbs={[{ label: "Home", href: ROUTES.public.home }, { label: "About" }]}
>>>>>>> theirs
      actions={[
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
<<<<<<< ours
<<<<<<< ours
      <section className="grid gap-6 rounded-[2rem] border border-white/75 bg-white/70 p-6 lg:grid-cols-2">
        <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6">
          <SectionHeader
            eyebrow="Our mission"
            title="Affordable ownership for every household"
            description="Simple language, clear monthly obligations, and branch-led support."
          />
        </div>
        <div className="rounded-[1.8rem] border border-white/75 bg-white/82 p-6">
          <SectionHeader
            eyebrow="Our promise"
            title="No fake claims, no hidden confusion"
            description="We publish real winner and product signals from live records."
          />
        </div>
      </section>

      <CtaBanner
        title="Want to know if your monthly budget fits?"
        description="Share your product choice and monthly comfort. Our team will guide you with practical options."
        actions={[
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
=======
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

=======
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

>>>>>>> theirs
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
          { href: ROUTES.public.products, label: "Products", variant: "secondary" },
          { href: ROUTES.public.contact, label: "Contact", variant: "primary" },
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
        ]}
      />
    </PublicPageShell>
  );
}
