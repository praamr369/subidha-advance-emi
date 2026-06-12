import Link from "next/link";
import type { Metadata } from "next";

import CtaBanner from "@/components/public/CtaBanner";
import DrawEvidenceExplainer from "@/components/public/DrawEvidenceExplainer";
import DrawTransparencyHero from "@/components/public/DrawTransparencyHero";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import SectionHeader from "@/components/public/SectionHeader";
import { buildPublicMetadata } from "@/lib/public-seo";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";
import {
  getPublicLuckyDrawLatestSummary,
  type PublicLuckyDrawSummary,
} from "@/lib/public-api";

export const metadata: Metadata = buildPublicMetadata({
  title: "Fair Draw",
  description: "Public Lucky Draw trust summary and commitment certificate.",
  path: "/lucky-plan/fair-draw",
});

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function TrustMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="public-card-sm px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function SummaryCard({ draw }: { draw: PublicLuckyDrawSummary }) {
  return (
    <section className="public-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Latest published commitment
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">{draw.batch_code}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Commitment hash is published before the reveal. The seed is checked later to verify the draw.
          </p>
        </div>
        <Link
          href={`${ROUTES.public.fairDraw}/${draw.id}`}
          className="inline-flex h-10 items-center rounded-xl border border-border bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
        >
          Open certificate
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TrustMetric label="Draw month" value={`Month ${draw.draw_month}`} />
        <TrustMetric label="Published at" value={formatDateTime(draw.commitment_published_at || draw.draw_date)} />
        <TrustMetric label="Public hash" value={draw.public_commit_hash || "—"} />
        <TrustMetric label="Eligibility snapshots" value={String(draw.eligible_snapshot_count ?? 0)} />
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 bg-[color-mix(in_oklab,var(--surface-card-elevated)_80%,transparent)] px-4 py-3 text-sm leading-6 text-muted-foreground">
        <span className="font-semibold text-foreground">Verification status: </span>
        {statusLabel(draw.public_verification_status || draw.verification_status)}
        <span className="mx-2 text-muted-foreground/70">•</span>
        {draw.waiver_scope || "FUTURE_EMI_ONLY"}
        <span className="mx-2 text-muted-foreground/70">•</span>
        {draw.public_explanation || "The commitment hash is like a sealed envelope."}
      </div>
    </section>
  );
}

export default async function FairDrawPage() {
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  let draw: PublicLuckyDrawSummary | null = null;
  let error: string | null = null;

  try {
    const payload = await getPublicLuckyDrawLatestSummary();
    draw = payload.draw;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load fair draw summary right now.";
  }

  return (
    <PublicPageShell
      title="Fair Draw"
      subtitle="Public trust summary, commitment certificate, and verification explanation."
      heroSlot={
        <DrawTransparencyHero
          mode="fairDraw"
          title="Fair Draw"
          subtitle="Understand the public commitment, reveal, verification, privacy, and future-EMI-only benefit boundary without exposing private customer records."
        />
      }
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.luckyPlan, href: ROUTES.public.luckyPlan },
        { label: "Fair Draw" },
      ]}
      actions={[
        { label: dictionary.common.winners, href: ROUTES.public.winners, variant: "secondary" },
        { label: dictionary.common.howItWorks, href: ROUTES.public.howItWorks, variant: "secondary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Public trust"
        title="Commitment hash first, reveal later"
        description="This page explains the draw in plain language so customers can see the published commitment, later verification, and the future-only waiver rule."
        items={[
          { title: "Sealed envelope", description: "The commitment hash is published before the seed is revealed." },
          { title: "Later verification", description: "The revealed seed can be checked against the commitment after the draw." },
          { title: "Privacy-safe public record", description: "Only masked winner details and safe metadata are shown publicly." },
          { title: "Future EMI waiver only", description: "The winner benefit never rewrites already settled EMI history." },
        ]}
      />

      <DrawEvidenceExplainer />

      <section className="public-surface space-y-4 p-6">
        <SectionHeader
          eyebrow="Latest draw"
          title="Published commitment certificate"
          description="If a draw commitment exists, the latest published draw appears here. No fake data is shown when the backend has no record yet."
        />
        {error ? (
          <div className="rounded-[1.6rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
            {error}
          </div>
        ) : draw ? (
          <SummaryCard draw={draw} />
        ) : (
          <div className="public-card-sm px-5 py-4 text-sm leading-6 text-muted-foreground">
            No committed Lucky Draw has been published yet. Once a commitment exists, the trust summary and certificate will appear here.
          </div>
        )}
      </section>

      <PublicMarketingBanner
        eyebrow="Public rule"
        title="What customers should understand"
        description="The draw is designed for verifiable trust without exposing private customer records. Public pages explain status; they do not perform draw execution."
        items={[
          { title: "Masked winner display", description: "Names are partially masked; phone numbers, KYC IDs, and internal IDs stay hidden." },
          { title: "Snapshot count", description: "The published certificate can show how many eligibility records were frozen for the draw." },
          { title: "Verification status", description: "Public pages distinguish committed, revealed, and legacy records without altering the finance ledger." },
        ]}
      />

      <CtaBanner
        title="Review the published draw detail"
        description="Open a specific draw certificate, verification result, and masked winner view. Public detail remains read-only."
        actions={[
          {
            href: draw?.id ? `${ROUTES.public.fairDraw}/${draw.id}` : ROUTES.public.fairDraw,
            label: "Open latest draw",
            variant: "primary",
          },
          { href: ROUTES.public.winnerHistory, label: dictionary.common.winnerHistory, variant: "secondary" },
        ]}
      />
    </PublicPageShell>
  );
}
