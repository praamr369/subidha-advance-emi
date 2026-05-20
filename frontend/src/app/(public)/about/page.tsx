import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicDisclaimerBox from "@/components/public/PublicDisclaimerBox";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import PublicTrustBadgeGrid from "@/components/public/PublicTrustBadgeGrid";
import SectionHeader from "@/components/public/SectionHeader";
import { buildPublicMetadata, getPublicDictionary } from "@/lib/public-i18n";
import { PUBLIC_LEGAL_DISCLAIMER_POINTS, PUBLIC_PURPOSE_BADGES } from "@/lib/public-content";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";

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
  const banner = getPublicBannerWithFallback("about");

  return (
    <PublicPageShell
      title={dictionary.nav.links[6]}
      subtitle="We are a local retail business helping families own furniture, electronics, and appliances through practical monthly plans."
      hero={{
        eyebrow: "About Subidha Furniture",
        imageSrc: banner.src,
        imageAlt: "About Subidha Furniture banner image",
        imageExists: banner.exists,
        badges: ["Asansol local brand", "Operational transparency", "Service-first promise"],
      }}
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
        eyebrow="Our purpose"
        title="A trusted local furniture business with transparent customer paths"
        description="Subidha Furniture helps customers choose Advance EMI, Rent, Lease, or Direct Sale based on need and eligibility."
        items={[
          { title: "Structured options", description: "Advance EMI, Rent, Lease, and Direct Sale for different household needs." },
          { title: "Transparent records", description: "Contracts, invoices, receipts, delivery notes, and support history remain traceable." },
          { title: "Verification-first", description: "KYC and admin checks can be required before activation, handover, or delivery." },
        ]}
      />

      <PublicTrustBadgeGrid items={PUBLIC_PURPOSE_BADGES} />

      <PublicMarketingBanner
        eyebrow="Customer trust model"
        title="Transparent plan rules and operational proof"
        description="We publish process explanations for plan rules, winner transparency, payment safety, and delivery workflow."
        items={[
          { title: "Plan rules", description: "Customers can review eligibility, tenure, and monthly commitment rules before applying." },
          { title: "Winner transparency", description: "Public winner pages use revealed draw records with masked names." },
          { title: "Delivery + support", description: "Delivery tracking and warranty/return support remain available post-sale." },
        ]}
      />

      <section className="public-surface p-6">
        <SectionHeader
          eyebrow="Brand story"
          title="Built for daily retail reality"
          description="Subidha CORE supports actual retail operations, including customer onboarding, payment follow-up, and winner publication clarity."
        />
      </section>

      <PublicDisclaimerBox points={PUBLIC_LEGAL_DISCLAIMER_POINTS} />

      <CtaBanner
        title="Ready to explore current options?"
        description="See the public catalogue and contact the branch to check active batches and monthly plan comfort."
        actions={[
          { href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" },
          { href: ROUTES.public.contact, label: dictionary.common.contact, variant: "secondary" },
          { href: ROUTES.public.policies, label: "View policies", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
