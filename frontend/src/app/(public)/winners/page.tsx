import type { Metadata } from "next";

import DrawEvidenceExplainer from "@/components/public/DrawEvidenceExplainer";
import DrawTransparencyHero from "@/components/public/DrawTransparencyHero";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import WinnerPublicationCard from "@/components/public/WinnerPublicationCard";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { ROUTES } from "@/lib/routes";
import { getPublicLatestWinner, getPublicWinners, type PublicWinner } from "@/lib/public-api";

export const metadata: Metadata = buildPublicMetadata({
  title: "Winners",
  description: "Recent Lucky Plan winners from revealed draw records with privacy-safe public evidence.",
  path: "/winners",
});

export default async function WinnersPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  let error: string | null = null;
  let latestWinner: PublicWinner | null = null;
  let winners: PublicWinner[] = [];

  try {
    const [latestResult, winnersResult] = await Promise.all([getPublicLatestWinner(), getPublicWinners(12)]);
    latestWinner = latestResult.winner;
    winners = winnersResult.results;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load winner data right now.";
  }

  return (
    <PublicPageShell
      title={dictionary.common.winners}
      subtitle="Only rows returned by the public draw API are shown. Names appear in a privacy-safe masked form; internal customer identifiers are never listed here."
      heroSlot={
        <DrawTransparencyHero
          mode="winners"
          title={dictionary.common.winners}
          subtitle="Recent Lucky Plan winner records from revealed draw data, shown with masked identity, public evidence fields, and future-EMI-only benefit boundaries."
        />
      }
      breadcrumbs={[{ label: dictionary.common.home, href: ROUTES.public.home }, { label: dictionary.common.winners }]}
      actions={[
        { label: dictionary.common.winnerHistory, href: ROUTES.public.winnerHistory, variant: "secondary" },
        { label: dictionary.common.apply, href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <WinnerSpotlight winner={latestWinner} />

      <PublicMarketingBanner
        eyebrow="Winner highlight"
        title="Transparency first, always"
        description="Published entries are sourced from revealed events and shown with privacy boundaries, public proof fields, and customer-readable rule context."
        items={[
          { title: "Public evidence", description: "Commitment references are shown when available." },
          { title: "Masked identity", description: "Winner names are masked to protect customer privacy." },
          { title: "No fake records", description: "If nothing is published, page shows empty state." },
          { title: "Future-EMI waiver only", description: "Past settled payments remain unchanged." },
        ]}
      />

      <DrawEvidenceExplainer />

      <section className="public-surface space-y-4 p-6">
        <SectionHeader
          eyebrow="Recent"
          title="Recent published winners"
          description="This feed is sourced from revealed draw records. If the public service is unavailable, the page shows an error instead of demo rows."
        />
        {error ? (
          <div className="rounded-[1.6rem] border border-red-200/90 bg-[linear-gradient(180deg,rgba(254,242,242,0.98),rgba(254,226,226,0.9))] px-5 py-4 text-sm text-red-700 shadow-[0_16px_36px_-28px_rgba(127,29,29,0.42)]">
            {error}
          </div>
        ) : winners.length === 0 ? (
          <div className="public-card-sm px-5 py-4 text-sm leading-6 text-muted-foreground">
            No winners are published yet. When revealed draw records exist, they will appear here.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {winners.map((winner) => (
              <WinnerPublicationCard key={winner.id} winner={winner} />
            ))}
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
