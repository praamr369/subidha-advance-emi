import type { Metadata } from "next";
import Link from "next/link";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";
import ContactLeadForm from "./ContactLeadForm";

export const metadata: Metadata = buildPublicMetadata({
  title: "Contact",
  description: "Contact Subidha Furniture for product, batch, and easy monthly plan guidance.",
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
      breadcrumbs={[{ label: dictionary.common.home, href: ROUTES.public.home }, { label: dictionary.common.contact }]}
      actions={[
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
        { label: dictionary.common.products, href: ROUTES.public.products, variant: "secondary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Help section"
        title="Talk to us in simple language"
        description="Our branch team guides customers through products, plan options, required documents, and next steps."
        items={[
          { title: "Plan clarity", description: "Understand monthly amount and tenure before joining." },
          { title: "Document guidance", description: "Know what to carry for quicker onboarding." },
          { title: "Follow-up support", description: "Get branch-level help after enquiry submission." },
        ]}
      />

      <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-6">
          <div className="rounded-[2rem] border border-white/75 bg-white/82 p-6">
            <SectionHeader eyebrow="Branch" title="Visit our store" description="Asansol, West Bengal" />
            {profile.address_text ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{profile.address_text}</p> : null}
            <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
              {profile.support_phone ? <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">Phone: {profile.support_phone}</div> : null}
              {profile.support_email ? <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">Email: {profile.support_email}</div> : null}
              {profile.business_hours ? <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3">Hours: {profile.business_hours}</div> : null}
              {profile.map_url ? <Link href={profile.map_url} className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 transition hover:bg-white">Open map</Link> : null}
            </div>
          </div>
        </section>

        <ContactLeadForm />
      </section>

      <CtaBanner
        title="Need product-first assistance?"
        description="Browse products first, then submit an enquiry with product context."
        actions={[
          { href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" },
          { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
