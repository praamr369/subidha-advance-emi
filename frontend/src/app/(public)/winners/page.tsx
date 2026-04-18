import type { Metadata } from "next";

import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import WinnerSpotlight from "@/components/public/WinnerSpotlight";
import { ROUTES } from "@/lib/routes";
import {
  getPublicLatestWinner,
  getPublicWinners,
  type PublicWinner,
} from "@/lib/public-api";

export const metadata: Metadata = {
  title: "Winners",
  description:
    "Recent Lucky Plan winners published from revealed draw records. Winner benefit applies to future EMI waiver only.",
};

function formatDrawDate(value: string | null | undefined): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function WinnerCard({ winner }: { winner: PublicWinner }) {
  const commitment = (winner.committed_hash || "").trim();
  const commitmentPreview =
    commitment.length > 16 ? `${commitment.slice(0, 10)}…${commitment.slice(-6)}` : commitment;

  return (
    <div className="rounded-[2rem] border border-white/75 bg-white/82 p-6 shadow-[0_24px_60px_-46px_rgba(15,23,42,0.62)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Batch {winner.batch_code} · Month {winner.draw_month}
      </div>
      <div className="mt-3 text-xl font-semibold text-foreground">
        {winner.customer_name || "Winner published"}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Lucky ID {winner.lucky_id || "—"} · Published {formatDrawDate(winner.draw_date)}
      </p>
      {winner.product_name ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Product context: {winner.product_name}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2 text-sm">
        <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 text-muted-foreground">
          Winner benefit: future EMI waiver only (no refund of past paid EMI).
        </div>
        {commitmentPreview ? (
          <div className="rounded-xl border border-white/75 bg-white/70 px-4 py-3 text-muted-foreground">
            Commitment hash: {commitmentPreview}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function WinnersPage() {
  const [latestResult, winnersResult] = await Promise.allSettled([
    getPublicLatestWinner(),
    getPublicWinners(12),
  ]);

  const latestWinner =
    latestResult.status === "fulfilled" ? latestResult.value.winner : null;
  const winners =
    winnersResult.status === "fulfilled" ? winnersResult.value.results : [];
  const error =
    winnersResult.status === "rejected"
      ? winnersResult.reason instanceof Error
        ? winnersResult.reason.message
        : "Unable to load winners right now."
      : null;

  return (
    <PublicPageShell
      title="Winners"
      subtitle="Recent winners published from revealed draw records. The public site shows real records or honest empty states."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Winners" },
      ]}
      actions={[
        {
          label: "Winner history",
          href: ROUTES.public.winnerHistory,
          variant: "secondary",
        },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <WinnerSpotlight winner={latestWinner} />

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
