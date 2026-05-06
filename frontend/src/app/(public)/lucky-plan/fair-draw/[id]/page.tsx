import type { Metadata } from "next";
import type { ReactNode } from "react";

import CtaBanner from "@/components/public/CtaBanner";
import PublicMarketingBanner from "@/components/public/PublicMarketingBanner";
import PublicPageShell from "@/components/public/PublicPageShell";
import { buildPublicMetadata } from "@/lib/public-seo";
import { getPublicDictionary } from "@/lib/public-i18n";
import { getPublicLocale } from "@/lib/public-i18n.server";
import { ROUTES } from "@/lib/routes";
import {
  getPublicLuckyDrawCertificate,
  getPublicLuckyDrawSummary,
  getPublicLuckyDrawVerification,
  getPublicLuckyDrawWinner,
  type PublicLuckyDrawSummary,
  type PublicLuckyDrawVerification,
} from "@/lib/public-api";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return buildPublicMetadata({
    title: `Fair Draw #${id}`,
    description: "Public commitment certificate, verification result, and masked winner detail.",
    path: `/lucky-plan/fair-draw/${id}`,
  });
}

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

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/75 bg-white/90 p-6 shadow-[0_24px_70px_-48px_rgba(15,23,42,0.6)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      <h3 className="mt-2 text-2xl font-semibold text-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default async function FairDrawDetailPage({ params }: PageProps) {
  const { id } = await params;
  const locale = await getPublicLocale();
  const dictionary = getPublicDictionary(locale);

  let summary: PublicLuckyDrawSummary | null = null;
  let verification: PublicLuckyDrawVerification | null = null;
  let error: string | null = null;

  try {
    const [summaryPayload, certificatePayload, verificationPayload, winnerPayload] = await Promise.all([
      getPublicLuckyDrawSummary(id),
      getPublicLuckyDrawCertificate(id),
      getPublicLuckyDrawVerification(id),
      getPublicLuckyDrawWinner(id),
    ]);
    summary = summaryPayload.draw || certificatePayload.certificate || winnerPayload.winner;
    verification = verificationPayload.verification;
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to load Lucky Draw detail right now.";
  }

  const certificate = summary;

  return (
    <PublicPageShell
      title={certificate ? `Fair Draw #${id}` : "Fair Draw Detail"}
      subtitle="Certificate, verification, and masked winner record."
      breadcrumbs={[
        { label: dictionary.common.home, href: ROUTES.public.home },
        { label: dictionary.common.luckyPlan, href: ROUTES.public.luckyPlan },
        { label: "Fair Draw", href: ROUTES.public.fairDraw },
        { label: `Draw ${id}` },
      ]}
      actions={[
        { label: dictionary.common.winnerHistory, href: ROUTES.public.winnerHistory, variant: "secondary" },
        { label: dictionary.common.howItWorks, href: ROUTES.public.howItWorks, variant: "secondary" },
      ]}
    >
      <PublicMarketingBanner
        eyebrow="Public verification"
        title="Trust without exposing private customer data"
        description="This page shows the published commitment, later verification record, and a masked winner summary only."
        items={[
          { title: "No raw PII", description: "Public data never includes phone numbers, Aadhaar, KYC IDs, or internal customer identifiers." },
          { title: "Seed later", description: "The reveal seed appears only after the draw is revealed and the verification record is published." },
          { title: "Future EMI waiver only", description: "The winning benefit applies to future EMI obligations only." },
        ]}
      />

      {error ? (
        <section className="rounded-[2rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
          {error}
        </section>
      ) : certificate ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <Panel eyebrow="Certificate" title="Published commitment certificate">
              <div className="grid gap-4 md:grid-cols-2">
                <Metric label="Batch" value={certificate.batch_code} />
                <Metric label="Draw month" value={`Month ${certificate.draw_month}`} />
                <Metric label="Published at" value={formatDateTime(certificate.commitment_published_at || certificate.draw_date)} />
                <Metric label="Public hash" value={certificate.public_commit_hash || "—"} />
                <Metric label="Eligibility snapshots" value={String(certificate.eligible_snapshot_count ?? 0)} />
                <Metric label="Public verification" value={statusLabel(certificate.public_verification_status || certificate.verification_status)} />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {certificate.public_explanation || "The commitment hash is like a sealed envelope."}
              </p>
            </Panel>

            <Panel eyebrow="Timeline" title="Lifecycle history">
              <ul className="space-y-3">
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Commitment Published</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(certificate.commitment_published_at || certificate.draw_date)}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    Public hash published before reveal so the draw can be checked later.
                  </div>
                </li>
                <li className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">Reveal Window</div>
                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(certificate.reveal_timestamp || verification?.reveal_timestamp)}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-700">
                    Verification is published after reveal; the seed is visible only after the approved flow completes.
                  </div>
                </li>
              </ul>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel eyebrow="Verification" title="Public verification record">
              <div className="grid gap-4">
                <Metric label="Status" value={statusLabel(verification?.public_verification_status || verification?.verification_status)} />
                <Metric label="Hash matches" value={verification?.hash_matches === true ? "Yes" : verification?.hash_matches === false ? "No" : "Pending"} />
                <Metric label="Reveal seed" value={verification?.revealed_seed ? verification.revealed_seed : "Hidden until reveal"} />
                <Metric label="Recalculated hash" value={verification?.recalculated_hash || "—"} />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {verification?.verification_message || "Draw is committed but not yet revealed."}
              </p>
            </Panel>

            <Panel eyebrow="Winner" title="Masked public winner detail">
              <div className="grid gap-4">
                <Metric label="Winner display" value={certificate.winner_name_masked || "Pending"} />
                <Metric label="Lucky number" value={certificate.winner_lucky_number != null ? `Lucky #${String(certificate.winner_lucky_number).padStart(2, "0")}` : "Pending"} />
                <Metric label="Product" value={certificate.product_name || "—"} />
                <Metric label="Waived EMI" value={certificate.waived_emi_count != null ? `${certificate.waived_emi_count} EMI rows` : "—"} />
                <Metric label="Waived amount" value={certificate.waived_amount || "—"} />
                <Metric label="Waiver scope" value={certificate.waiver_scope || "FUTURE_EMI_ONLY"} />
              </div>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                {certificate.winner_benefit_note || "Winner receives future EMI waiver only."}
              </p>
            </Panel>
          </div>
        </div>
      ) : (
        <section className="rounded-[2rem] border border-white/75 bg-white/80 px-5 py-4 text-sm leading-6 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
          No public Fair Draw record was found for this identifier. The page stays honest and does not fabricate a draw.
        </section>
      )}

      <CtaBanner
        title="Understand the fair draw process"
        description="Review the public explanation and browse related winner records."
        actions={[
          { href: ROUTES.public.fairDraw, label: "Back to fair draw", variant: "secondary" },
          { href: ROUTES.public.winners, label: dictionary.common.winners, variant: "secondary" },
          { href: ROUTES.public.howItWorks, label: dictionary.common.howItWorks, variant: "primary" },
        ]}
      />
    </PublicPageShell>
  );
}
