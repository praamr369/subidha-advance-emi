import type { Metadata } from "next";
import Link from "next/link";

import BrandLockup from "@/components/public/BrandLockup";
import CtaBanner from "@/components/public/CtaBanner";
import HomeFeaturedProductsShowcase from "@/components/public/HomeFeaturedProductsShowcase";
import PlanCategoryShowcase from "@/components/public/PlanCategoryShowcase";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import SectionHeader from "@/components/public/SectionHeader";
import TrustStrip from "@/components/public/TrustStrip";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { brandConfig } from "@/config/brand";
import { asLocale, getPublicDictionary, getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildOrganizationJsonLd, buildPublicMetadata } from "@/lib/public-seo";
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
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />

      <section className="public-hero p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <BrandLockup logoSrc={profile.resolved_logo_src} companyName={profile.resolved_display_name} subtitle={`${profile.resolved_tagline} · ${brandConfig.publicBranchLocation}`} />
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-[3.2rem]">{heroTitle}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{heroSubtitle}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={ROUTES.public.apply}
                className="inline-flex h-11 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Apply now
              </Link>
              <Link
                href={ROUTES.public.products}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 focus-visible:ring-offset-2"
              >
                Explore products
              </Link>
              <Link
                href={ROUTES.public.luckyPlan}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 focus-visible:ring-offset-2"
              >
                See Lucky Plan
              </Link>
              <Link
                href={ROUTES.public.winners}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 focus-visible:ring-offset-2"
              >
                Visit winners
              </Link>
              <Link
                href={ROUTES.public.policies}
                className="inline-flex h-11 items-center rounded-xl border border-white/75 bg-white/75 px-5 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 focus-visible:ring-offset-2"
              >
                Business policies
              </Link>
            </div>
          </div>

          <PublicMarketingBanner
            eyebrow="Featured categories"
            title="Designed for family shopping"
            description="Realistic product categories our customers ask for every day."
            items={[
              { title: "Furniture", description: "Sofas, beds, wardrobes, dining sets." },
              { title: "Electronics", description: "TV and essential home electronics." },
              { title: "Home appliances", description: "Refrigerator, washing machine, kitchen appliances." },
            ]}
          />
        </div>
      </section>

      <TrustStrip />

      <PublicMarketingBanner
        eyebrow="Easy monthly plan"
        title="Simple process, transparent records"
        description="Choose a product, join an active batch, pay monthly EMI, and track published winners with no fake claims."
        items={[
          { title: "Clear monthly amount", description: "Know your monthly commitment before enrollment." },
          { title: "Transparent winner process", description: "Published records come from revealed draws only." },
          { title: "Support-first onboarding", description: "Branch team helps with product and document readiness." },
        ]}
      />

      <PublicMarketingBanner
        eyebrow="Customer trust"
        title="Plan rules, payment safety, and delivery transparency"
        description="Before joining, every customer can review plan rules, payment safeguards, and the delivery process in plain language."
        items={[
          { title: "Plan rules", description: "Clear tenure, monthly amount, and winner benefit scope before enrollment." },
          { title: "Payment safety", description: "Every payment is receipted and visible in the customer portal." },
          { title: "Delivery process", description: "Delivery scheduling and status are tracked separately from payment records." },
        ]}
      />

      <PlanCategoryShowcase />

      <section className="public-surface space-y-4 p-6">
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
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Winner spotlight" title="Latest winner" description="Published from revealed lucky draw records only." />
        <WinnerSpotlight winner={latestWinner} />
      </section>

      <section className="public-surface space-y-4 p-6">
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
      </section>

      <CtaBanner
        title="Need guidance in your preferred language?"
        description="Use the language switcher in the header for English, हिन्दी, or বাংলা, then connect with the branch for assisted enrollment."
        actions={[
          { href: ROUTES.public.contact, label: "Contact us", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Start application", variant: "primary" },
        ]}
      />
    </main>
  );
}
