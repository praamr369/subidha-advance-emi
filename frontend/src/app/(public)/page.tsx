import type { Metadata } from "next";

import { PublicMarketingShell } from "@/components/layout/page-shells";
import CtaBanner from "@/components/public/CtaBanner";
import FaqBlock from "@/components/public/FaqBlock";
import HomeFeaturedProductsShowcase from "@/components/public/HomeFeaturedProductsShowcase";
import HomeLandingHero from "@/components/public/HomeLandingHero";
import HomePlanFlowPreview from "@/components/public/HomePlanFlowPreview";
import PlanCategoryShowcase from "@/components/public/PlanCategoryShowcase";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import RentLeaseComparison from "@/components/public/RentLeaseComparison";
import SectionHeader from "@/components/public/SectionHeader";
import PublicTrustStrip from "@/components/public/PublicTrustStrip";
import TrustPillars from "@/components/public/TrustPillars";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { asLocale, getPublicDictionary, getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildPublicMetadata } from "@/lib/public-seo";
import { FULL_PUBLIC_FAQ } from "@/lib/public-content";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = buildPublicMetadata({
  title: "Home",
  description: "Bring home furniture, electronics, and home appliances with easy monthly plans and transparent Lucky Plan winner publication.",
  path: "/",
});

export default async function PublicHome() {
  const language = await getPublicLanguage();
  const profile = await getResolvedPublicBusinessProfile();
  const [statsResult, latestWinnerResult, productsResult] = await Promise.allSettled([getPublicStats(), getPublicLatestWinner(), listPublicProducts()]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const latestWinner = latestWinnerResult.status === "fulfilled" ? latestWinnerResult.value.winner : null;
  const products = productsResult.status === "fulfilled" ? productsResult.value.products.slice(0, 6) : [];

  const heroTitle = getText(publicContent.homeHero.title, language);
  const heroSubtitle = getText(publicContent.homeHero.subtitle, language);
  const dictionary = getPublicDictionary(asLocale(language));

  return (
    <PublicMarketingShell
      className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      hero={
        <HomeLandingHero
          title={heroTitle}
          subtitle={heroSubtitle}
          companyName={profile.resolved_display_name}
          tagline={profile.resolved_tagline}
          stats={stats}
        />
      }
      trust={<PublicTrustStrip />}
      sections={
        <>
          <PublicMarketingBanner
            eyebrow="Easy monthly plan"
            title="Furniture plans that look modern outside and stay controlled inside"
            description="The public site helps customers understand products, Lucky Plan EMI, rent and lease options. Actual subscriptions, payments, receipts, winners and delivery records remain controlled by the core system."
            items={[
              { title: "Clear monthly amount", description: "Know the expected monthly commitment before enrollment." },
              { title: "Transparent winner process", description: "Published records come from revealed draw data only." },
              { title: "Branch-assisted onboarding", description: "The showroom team helps with product, plan and document readiness." },
            ]}
          />

          <HomePlanFlowPreview />

          <PublicMarketingBanner
            eyebrow="Customer trust"
            title="Plan rules, payment safety, and delivery transparency"
            description="Before joining, every customer can review plan rules, payment safeguards, and the delivery process in plain language. Public pages never replace customer ledger or receipt records."
            items={[
              { title: "Plan rules", description: "Clear tenure, monthly amount, and winner benefit scope before enrollment." },
              { title: "Payment safety", description: "Every payment is receipted and visible in the customer portal." },
              { title: "Delivery process", description: "Delivery scheduling and status are tracked separately from payment records." },
            ]}
          />

          <PlanCategoryShowcase />

          <PublicSectionShell className="space-y-4">
            <SectionHeader eyebrow="Live public stats" title="Live public business signals" description="These indicators come from live public APIs and reflect production records." />
            {stats ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: "Published batches", value: stats.total_batches },
                  { label: "Total subscriptions", value: stats.total_subscriptions },
                  { label: "Active subscriptions", value: stats.active_subscriptions },
                  { label: "Published winners", value: stats.total_winners },
                ].map((item) => (
                  <div key={item.label} className="public-card p-5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div>
                    <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{item.value.toLocaleString("en-IN")}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="public-card-sm px-5 py-4 text-sm text-muted-foreground">Live public stats are currently unavailable.</div>
            )}
          </PublicSectionShell>

          <section className="space-y-4">
            <SectionHeader eyebrow="Winner spotlight" title="Latest winner" description="Published from revealed lucky draw records only." />
            <WinnerSpotlight winner={latestWinner} />
          </section>

          <PublicSectionShell className="space-y-4">
            <SectionHeader eyebrow="Live catalogue" title="Featured products" description="Products are loaded from the real backend catalogue." />
            {products.length === 0 ? (
              <div className="public-card-sm px-5 py-4 text-sm leading-6 text-muted-foreground">No products are currently published in the public catalogue.</div>
            ) : (
              <HomeFeaturedProductsShowcase
                products={products}
                ariaCarouselLabel={dictionary.common.mediaCarousel.featuredLabel}
                prevLabel={dictionary.common.mediaCarousel.previousSlide}
                nextLabel={dictionary.common.mediaCarousel.nextSlide}
              />
            )}
          </PublicSectionShell>

          <TrustPillars />

          <section className="space-y-4">
            <SectionHeader
              eyebrow="Rent vs Lease"
              title="Understanding rent and lease"
              description="Neither rent nor lease participates in Lucky Plan draws. Both use a deposit-plus-monthly-demand structure."
            />
            <RentLeaseComparison />
          </section>

          <PublicSectionShell className="space-y-4">
            <SectionHeader
              eyebrow="Common questions"
              title="Quick answers"
              description="A selection of the most-asked questions. Visit the FAQ page for the full list."
            />
            <FaqBlock items={FULL_PUBLIC_FAQ.slice(0, 5)} />
            <div className="flex justify-center">
              <a href={ROUTES.public.faq} className="public-action-secondary text-sm">
                View all FAQs →
              </a>
            </div>
          </PublicSectionShell>

          <CtaBanner
            title="Start with a product or talk to the branch"
            description="Choose a product, send an enquiry, or contact the store. Public actions create leads only after you submit the form."
            actions={[
              { href: ROUTES.public.products, label: dictionary.common.products, variant: "secondary" },
              { href: ROUTES.public.faq, label: "View FAQ", variant: "secondary" },
              { href: ROUTES.public.apply, label: dictionary.common.apply, variant: "primary" },
            ]}
          />
        </>
      }
    />
  );
}
