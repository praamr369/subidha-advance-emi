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
          eyebrow="Subidha Core — purpose"
          title="Why digital contract tracking matters"
          description="Subidha Core is the digital system behind Subidha Furniture's operations. It replaces informal paper registers with structured, receipt-backed records for every contract, payment, and delivery."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <article className="public-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Transparent payment records</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Every payment generates a receipt linked to the contract. Customers can view their full history in the customer portal after login.
            </p>
          </article>
          <article className="public-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Delivery readiness tracking</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Delivery is authorised only after KYC, contract, payment, and stock readiness checks. A handover document is generated at completion.
            </p>
          </article>
          <article className="public-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Customer document access</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Contracts, invoices, receipts, and delivery documents are accessible in the customer portal — making transactions traceable and verifiable.
            </p>
          </article>
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Subidha Furniture does not claim awards, government endorsements, or inflated customer counts. Our focus is practical, daily-use retail operation with honest digital records.
        </p>
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
