import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { ROUTES } from "@/lib/routes";
import {
  getPublicWinnerHistory,
  type PublicWinner,
} from "@/lib/public-api";
import WinnerHistoryTableClient from "./WinnerHistoryTableClient";

export const metadata: Metadata = {
  title: "Winner History",
  description:
    "Read the public winner history sourced from real revealed lucky draw events.",
};

export default async function WinnerHistoryPage() {
  let winners: PublicWinner[] = [];
  let error: string | null = null;

  try {
    const payload = await getPublicWinnerHistory(50);
    winners = payload.results;
  } catch (err) {
    error =
      err instanceof Error ? err.message : "Unable to load winner history right now.";
  }

  return (
    <PublicPageShell
      title="Winner History"
      subtitle="A long-term transparency archive sourced from revealed draw records. Winner benefit applies to future EMI waiver only."
      breadcrumbs={[
        { label: "Home", href: ROUTES.public.home },
        { label: "Winner History" },
      ]}
      actions={[
        { label: "Winners", href: ROUTES.public.winners, variant: "secondary" },
        { label: "Apply", href: ROUTES.public.apply, variant: "primary" },
      ]}
    >
      <section className="space-y-4 rounded-[2rem] border border-white/75 bg-white/70 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
        <SectionHeader
          eyebrow="Archive"
          title="Published records"
          description="If the backend has not published revealed draw records yet, the site shows an honest empty state."
        />
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
        title="Want to understand the rules behind the archive?"
        description="Read how batches, Lucky IDs (00–99), and the monthly winner publication work—and why the waiver applies to future EMI only."
        actions={[
          { href: ROUTES.public.howItWorks, label: "How it works", variant: "secondary" },
          { href: ROUTES.public.luckyPlan, label: "Lucky Plan", variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
