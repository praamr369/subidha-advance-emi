import type { Metadata } from "next";

import { PublicMarketingShell } from "@/components/layout/page-shells";
import BrandLockup from "@/components/public/BrandLockup";
import CtaBanner from "@/components/public/CtaBanner";
import HomeFeaturedProductsShowcase from "@/components/public/HomeFeaturedProductsShowcase";
import PlanCategoryShowcase from "@/components/public/PlanCategoryShowcase";
import PublicHeroBanner from "@/components/public/PublicHeroBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicSectionShell from "@/components/public/PublicSectionShell";
import SectionHeader from "@/components/public/SectionHeader";
import PublicTrustStrip from "@/components/public/PublicTrustStrip";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { brandConfig } from "@/config/brand";
import { asLocale, getPublicDictionary, getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildOrganizationJsonLd, buildPublicMetadata } from "@/lib/public-seo";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
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
  const homeBanner = getPublicBannerWithFallback("home");

  return (
    <PublicMarketingShell
      className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
      hero={
        <>
          <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />

          <div className="space-y-6">
            <PublicHeroBanner
              eyebrow="Subidha Furniture"
              title={heroTitle}
              subtitle={heroSubtitle}
              imageSrc={homeBanner.src}
              imageAlt="Subidha Furniture home banner with furniture collections"
              imageExists={homeBanner.exists}
              imagePriority
              primaryAction={{ href: ROUTES.public.apply, label: "Apply / Enquire" }}
              secondaryAction={{ href: ROUTES.public.products, label: "Explore products", variant: "secondary" }}
              badges={["Advance EMI", "Rent / Lease", "Direct Sale"]}
            />
            <BrandLockup logoSrc={profile.resolved_logo_src} companyName={profile.resolved_display_name} subtitle={`${profile.resolved_tagline} · ${brandConfig.publicBranchLocation}`} />
          </div>
        </>
      }
      trust={<PublicTrustStrip />}
      sections={
        <>
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

        </>
      }
      cta={
      <CtaBanner
        title="Need guidance in your preferred language?"
        description="Use the language switcher in the header for English, हिन्दी, or বাংলা, then connect with the branch for assisted enrollment."
        actions={[
          { href: ROUTES.public.contact, label: "Contact us", variant: "secondary" },
          { href: ROUTES.public.login, label: "Login to Customer Dashboard", variant: "secondary" },
          { href: ROUTES.public.apply, label: "Start application", variant: "primary" },
        ]}
      />
      }
    />
  );
}
