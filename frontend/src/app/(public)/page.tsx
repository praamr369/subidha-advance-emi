import type { Metadata } from "next";

import { PublicMarketingShell } from "@/components/layout/page-shells";
import { HOME_COPY } from "@/components/public/home/home-copy";
import HomeBulletin from "@/components/public/home/HomeBulletin";
import HomeCta from "@/components/public/home/HomeCta";
import HomeFaq from "@/components/public/home/HomeFaq";
import HomeHero from "@/components/public/home/HomeHero";
import HomeHowItWorks from "@/components/public/home/HomeHowItWorks";
import HomePlans from "@/components/public/home/HomePlans";
import HomeProductShowcase from "@/components/public/home/HomeProductShowcase";
import HomeQuickLinks from "@/components/public/home/HomeQuickLinks";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import HomeVision from "@/components/public/home/HomeVision";
import EMICalculatorWidget from "@/components/public/ui/EMICalculatorWidget";
import WhatsAppFab from "@/components/public/ui/WhatsAppFab";
import { asLocale, getPublicDictionary, getText, publicContent } from "@/lib/public-i18n";
import { getPublicLanguage } from "@/lib/public-i18n.server";
import { getPublicLatestWinner, getPublicStats, listPublicProducts } from "@/lib/public-api";
import { getResolvedPublicBusinessProfile } from "@/lib/public-profile";
import { buildPublicMetadata } from "@/lib/public-seo";

export const metadata: Metadata = buildPublicMetadata({
  title: "Home",
  description:
    "Furniture and home appliances in Asansol on Lucky Plan EMI, rent, lease or direct purchase — with receipted payments and publicly verifiable draws.",
  path: "/",
});

// Live figures may lag by up to a minute; in exchange the home page stops
// calling the API on every single visit.
const LIVE_DATA_CACHE = { revalidate: 60 } as const;
const FEATURED_PRODUCT_COUNT = 8;

export default async function PublicHome() {
  const [language, profile, [statsResult, latestWinnerResult, productsResult]] = await Promise.all([
    getPublicLanguage(),
    getResolvedPublicBusinessProfile(),
    Promise.allSettled([
      getPublicStats(LIVE_DATA_CACHE),
      getPublicLatestWinner(LIVE_DATA_CACHE),
      listPublicProducts({ limit: FEATURED_PRODUCT_COUNT, ...LIVE_DATA_CACHE }),
    ]),
  ]);

  const stats = statsResult.status === "fulfilled" ? statsResult.value : null;
  const latestWinner = latestWinnerResult.status === "fulfilled" ? latestWinnerResult.value.winner : null;
  const products =
    productsResult.status === "fulfilled" ? productsResult.value.products.slice(0, FEATURED_PRODUCT_COUNT) : [];
  const productCount = productsResult.status === "fulfilled" ? productsResult.value.count : null;

  const copy = HOME_COPY[language];
  const dictionary = getPublicDictionary(asLocale(language));

  return (
    <PublicMarketingShell
      className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      hero={
        <HomeHero
          copy={copy.hero}
          title={getText(publicContent.homeHero.title, language)}
          subtitle={getText(publicContent.homeHero.subtitle, language)}
          companyName={profile.resolved_display_name}
          stats={stats}
        />
      }
      sections={
        <>
          <HomeQuickLinks copy={copy.quickLinks} />
          <HomePlans copy={copy.plans} />
          <HomeProductShowcase copy={copy.products} products={products} totalCount={productCount} />
          <HomeBulletin copy={copy.bulletin} stats={stats} winner={latestWinner} />
          <HomeHowItWorks copy={copy.howItWorks} />
          <HomeVision copy={copy.vision} />

          <section id="emi-calculator" aria-label={copy.calculator.eyebrow} className="scroll-mt-24 space-y-6 lg:scroll-mt-64">
            <HomeSectionHeading
              eyebrow={copy.calculator.eyebrow}
              title={copy.calculator.title}
              description={copy.calculator.description}
            />
            <EMICalculatorWidget />
          </section>

          <HomeFaq copy={copy.faq} />

          <HomeCta copy={copy.cta} productsLabel={dictionary.common.products} applyLabel={dictionary.common.apply} />
          {profile.resolved_whatsapp_link ? <WhatsAppFab href={profile.resolved_whatsapp_link} /> : null}
        </>
      }
    />
  );
}
