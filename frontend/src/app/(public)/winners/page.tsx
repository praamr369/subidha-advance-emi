import type { Metadata } from "next";

import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { buildPublicMetadata } from "@/lib/public-seo";
import { getPublicBannerWithFallback } from "@/lib/public-page-banners";
import { ROUTES } from "@/lib/routes";
import { getPublicLatestWinner, getPublicWinners, type PublicWinner } from "@/lib/public-api";

export const metadata: Metadata = buildPublicMetadata({
  title: "Winners",
  description: "Recent Lucky Plan winners from revealed draw records.",
  path: "/winners",
});

function WinnerCard({ winner }: { winner: PublicWinner }) {
  return (
    <div className="rounded-[2rem] border border-white/75 bg-white/82 p-6">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Batch {winner.batch_code} · Month {winner.draw_month}</div>
      <div className="mt-3 text-xl font-semibold text-foreground">Lucky ID {winner.lucky_id || "—"}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Public display label:</span>{" "}
        {winner.winner_name_masked || "Not published"}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Draw: {winner.draw_datetime || winner.draw_date || "—"} · Verification {winner.verification_status || "unavailable"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground break-all">
        Public commit hash: {winner.public_commit_hash || winner.committed_hash || "—"}
      </p>
    </div>
  );
}

export default async function WinnersPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);
  const banner = getPublicBannerWithFallback("winners");
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
      hero={{
        eyebrow: "Winner publication",
        imageSrc: banner.src,
        imageAlt: "Subidha winners banner",
        imageExists: banner.exists,
        badges: ["Masked identity", "Live draw records", "Future EMI waiver only"],
      }}
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
        description="Published entries are sourced from revealed events and shown with clear rule context."
        items={[
          { title: "Public evidence", description: "Commitment references are shown when available." },
          { title: "Masked identity", description: "Winner names are masked to protect customer privacy." },
          { title: "No fake records", description: "If nothing is published, page shows empty state." },
          { title: "Future-EMI waiver only", description: "Past settled payments remain unchanged." },
        ]}
      />

      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Recent"
          title="Recent published winners"
          description="This feed is sourced from revealed draw records. If the public service is unavailable, the page shows an error instead of demo rows."
        />
        {error ? (
          <div className="rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            {error}
          </div>
        ) : winners.length === 0 ? (
          <div className="rounded-[1.6rem] border border-white/75 bg-white/80 px-5 py-4 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
            No winners are published yet. When revealed draw records exist, they will appear here.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {winners.map((winner) => (
              <WinnerCard key={winner.id} winner={winner} />
            ))}
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
