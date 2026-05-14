import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import WinnerHistoryProductCarousel from "@/components/public/WinnerHistoryProductCarousel";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { ROUTES } from "@/lib/routes";
import { getPublicWinnerHistory, type PublicWinner } from "@/lib/public-api";
import WinnerHistoryTableClient from "./WinnerHistoryTableClient";

export const metadata: Metadata = buildPublicMetadata({
  title: "Winner History",
  description: "Public archive of winner history sourced from revealed lucky draw events.",
  path: "/winner-history",
});

export default async function WinnerHistoryPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  const banner = getPublicBannerWithFallback("winners");
  let winners: PublicWinner[] = [];
  let error: string | null = null;

  try {
    const payload = await getPublicWinnerHistory(50);
    winners = payload.results;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load winner history right now.";
  }

  return (
    <PublicPageShell
      title={dictionary.common.winnerHistory}
      subtitle="Archive from live draw records."
      hero={{
        eyebrow: "Public archive",
        imageSrc: banner.src,
        imageAlt: "Winner history banner",
        imageExists: banner.exists,
        badges: ["Historical transparency", "No fabricated winners"],
      }}
      breadcrumbs={[{ label: dictionary.common.home, href: ROUTES.public.home }, { label: dictionary.common.winnerHistory }]}
      actions={[
        { label: dictionary.common.winners, href: ROUTES.public.winners, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Archive trust"
        title="Long-term winner transparency"
        description="This section helps customers validate past winner publication patterns over time."
        items={[
          { title: "Chronological records", description: "Entries are listed from real backend responses." },
          { title: "Masked winner names", description: "Public history masks customer names while retaining draw transparency." },
          { title: "Draw proof/hash", description: "Commitment hash is shown where available for public verification." },
          { title: "Honest system status", description: "Errors and empty states are shown directly." },
          { title: "Business rule continuity", description: "Winner benefit remains future-EMI-only." },
        ]}
      />

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Archive"
          title="Published records"
          description="If the backend has not published revealed draw records yet, the site shows an honest empty state."
        />
        {!error && winners.length > 0 ? (
          <WinnerHistoryProductCarousel
            winners={winners}
            ariaCarouselLabel={dictionary.common.mediaCarousel.winnerHighlightsLabel}
            prevLabel={dictionary.common.mediaCarousel.previousSlide}
            nextLabel={dictionary.common.mediaCarousel.nextSlide}
          />
        ) : null}
        {error ? (
          <div className="rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            {error}
          </div>
        ) : winners.length === 0 ? (
          <div className="rounded-[1.6rem] border border-white/75 bg-white/80 px-5 py-4 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            No winner history is published yet. When revealed draw records exist, they will appear here.
          </div>
        ) : (
          <WinnerHistoryTableClient winners={winners} />
        )}
      </section>

      <CtaBanner
        title="Want to understand the full process?"
        description="Read how batches, Lucky IDs, and winner publishing works."
        actions={[
          { href: ROUTES.public.howItWorks, label: dictionary.common.howItWorks, variant: "secondary" },
          { href: ROUTES.public.luckyPlan, label: dictionary.common.luckyPlan, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
