import type { Metadata } from "next";

import ContactBranchHero from "@/components/public/ContactBranchHero";
import ContactBranchTrustPanel from "@/components/public/ContactBranchTrustPanel";
import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";
import ContactLeadForm from "./ContactLeadForm";

export const metadata: Metadata = buildPublicMetadata({
  title: "Contact",
  description: "Contact Subidha Furniture for product, branch, Lucky Plan, rent, lease, direct-sale, document, and delivery guidance.",
  path: "/contact",
});

export default async function ContactPage() {
  const profile = await getResolvedPublicBusinessProfile();
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  return (
    <PublicPageShell
      title={dictionary.common.contact}
      subtitle="Call, visit, or send an enquiry. Our team will guide you in simple steps."
      heroSlot={<ContactBranchHero profile={profile} />}
      breadcrumbs={[{ label: dictionary.common.home, href: ROUTES.public.home }, { label: dictionary.common.contact }]}
      actions={[
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Help section"
        title="Talk to us in simple language"
        description="Our branch team guides customers through products, plan options, required documents, delivery expectations, and next steps. Public support remains separate from operational posting."
        items={[
          { title: "Plan clarity", description: "Understand monthly comfort, tenure, Lucky Plan scope, rent, lease, or direct-sale suitability before joining." },
          { title: "Document guidance", description: "Know what to carry for quicker onboarding and staff verification." },
          { title: "Follow-up support", description: "Get branch-level help after enquiry submission without creating financial records publicly." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Trust and policy help"
        title="Need clarity on rules, receipts, warranty, or delivery?"
        description="Support can explain plan rules, payment safety, winner publication, rent/lease deposit boundaries, warranty support, and delivery/return workflow before and after enrollment."
        items={[
          { title: "Plan and payment explanation", description: "Understand monthly amount, receipt flow, customer self-service access, and what happens only after staff approval." },
          { title: "Warranty / return policy", description: "Get product-level support guidance and escalation path." },
          { title: "Delivery process", description: "Confirm scheduling, handover expectations, and post-delivery support." },
        ]}
      />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <ContactBranchTrustPanel profile={profile} />
        <ContactLeadForm />
      </section>

      <CtaBanner
        title="Need product-first assistance?"
        description="Browse products first, then submit an enquiry with product context. Product selection does not reserve stock or create financial records until branch review."
        actions={[
          { href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
