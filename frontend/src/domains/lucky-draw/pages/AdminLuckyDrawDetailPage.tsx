"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { getLuckyDraw, type LuckyDrawRecord } from "@/services/draws";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function shortenHash(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 20) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function statusLabel(value: string | null | undefined): string {
  if (!value) return "Unavailable";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="max-w-[65%] break-all text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function InfoPanel({
  title,
  eyebrow,
  items,
  note,
}: {
  title: string;
  eyebrow: string;
  items: Array<{ label: string; value: string }>;
  note: string;
}) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.5)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</div>
      <h3 className="mt-2 text-xl font-semibold text-foreground">{title}</h3>
      <dl className="mt-4 space-y-3 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-start justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
            <dt className="text-slate-600">{item.label}</dt>
            <dd className="max-w-[60%] break-all text-right font-medium text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{note}</p>
    </section>
  );
}

export default function AdminLuckyDrawDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const drawId = String(params?.id || "");
  const [draw, setDraw] = useState<LuckyDrawRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraw(null);
    setError(null);

    getLuckyDraw(drawId)
      .then((payload) => {
        setDraw(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load draw detail");
      });
  }, [drawId]);

  const timeline = useMemo(() => {
    if (!draw) return [] as Array<{ at: string; label: string; detail: string }>;
    const events: Array<{ at: string; label: string; detail: string }> = [];

    if (draw.commitment_published_at || draw.created_at) {
      events.push({
        at: draw.commitment_published_at || draw.created_at || "",
        label: "Commitment Published",
        detail: draw.public_commit_hash
          ? `Public hash ${shortenHash(draw.public_commit_hash)}`
          : `Hash ${shortenHash(draw.committed_hash)}`,
      });
    }

    if (draw.draw_date) {
      events.push({
        at: draw.draw_date,
        label: draw.is_revealed ? "Draw Executed" : "Draw Scheduled",
        detail:
          draw.eligible_snapshot_count != null
            ? `${draw.eligible_snapshot_count} eligibility rows frozen`
            : "Eligibility snapshot unavailable",
      });
    }

    if (draw.revealed_at) {
      events.push({
        at: draw.revealed_at,
        label: "Reveal Published",
        detail: draw.winner_lucky_number
          ? `Winner Lucky #${String(draw.winner_lucky_number).padStart(2, "0")}`
          : "Winner pending",
      });
    }

    return events
      .filter((event) => event.at)
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [draw]);

  const certificateHash = draw?.public_commit_hash || draw?.committed_hash || "—";
  const certificatePublishedAt = formatDateTime(draw?.commitment_published_at || draw?.created_at);
  const winnerDisplayName = draw?.public_winner_name_masked || draw?.winner_customer_name || "—";
  const verificationStatus = statusLabel(draw?.public_verification_status || draw?.verification_status);

  return (
    <PortalPage
      title={draw ? `Lucky Draw #${draw.id}` : "Lucky Draw Detail"}
      subtitle="Committed hash, reveal state, winner result and traceability context."
    >
      <button type="button" onClick={() => router.push("/admin/lucky-draw")}>
        Back to Draw List
      </button>

      {error ? <ErrorState title="Failed to load draw detail" description={error} /> : null}

      {!error && !draw ? <LoadingBlock /> : null}

      {draw ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.5)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Draw certificate
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-foreground">
                    {draw.batch_code || "Lucky Draw"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Commitment hash is published first, reveal comes later, and winner benefit remains future EMI waiver only.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-slate-50"
                  >
                    Print / Save
                  </button>
                  <Link
                    href={`/lucky-plan/fair-draw/${draw.id}`}
                    className="inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:opacity-95"
                  >
                    Open public view
                  </Link>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DetailCard label="Draw ID" value={String(draw.id)} />
                <DetailCard label="Batch" value={draw.batch_code || (draw.batch ? `Batch #${draw.batch}` : "-")} />
                <DetailCard label="Draw Month" value={draw.draw_month ? `Month ${draw.draw_month}` : "-"} />
                <DetailCard label="Lifecycle" value={draw.is_revealed ? "REVEALED" : "PENDING REVEAL"} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <InfoPanel
                title="Commitment certificate"
                eyebrow="Certificate"
                items={[
                  { label: "Public hash", value: certificateHash },
                  { label: "Published at", value: certificatePublishedAt },
                  {
                    label: "Eligible snapshots",
                    value: draw.eligible_snapshot_count != null ? String(draw.eligible_snapshot_count) : "0",
                  },
                  { label: "Public verification", value: verificationStatus },
                ]}
                note={draw.public_explanation || "The commitment hash is like a sealed envelope."}
              />
              <InfoPanel
                title="Verification status"
                eyebrow="Verification"
                items={[
                  { label: "Verification status", value: verificationStatus },
                  { label: "Reveal time", value: formatDateTime(draw.revealed_at) },
                  {
                    label: "Winner",
                    value: draw.winner_lucky_number
                      ? `Lucky #${String(draw.winner_lucky_number).padStart(2, "0")}`
                      : "Pending",
                  },
                  { label: "Winner display", value: winnerDisplayName },
                ]}
                note="Seed is visible only after reveal when public verification is published."
              />
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.5)] print:shadow-none">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Lifecycle timeline
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    Commit, reveal, and publication history
                  </h3>
                </div>
              </div>
              {timeline.length === 0 ? (
                <EmptyState
                  title="No lifecycle events yet"
                  description="This draw has not produced a commitment or reveal event that can be shown in the certificate timeline."
                />
              ) : (
                <ul className="mt-4 space-y-3">
                  {timeline.map((event, index) => (
                    <li key={`${event.label}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">{event.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDateTime(event.at)}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">{event.detail}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="space-y-4 print:hidden">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.5)]">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Winner summary
              </div>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {draw.winner_lucky_number
                  ? `Lucky #${String(draw.winner_lucky_number).padStart(2, "0")}`
                  : "Winner pending"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{winnerDisplayName}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {draw.waived_emi_count != null
                  ? `${draw.waived_emi_count} future EMI rows waived`
                  : "Future EMI waiver only"}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {draw.waiver_scope || "FUTURE_EMI_ONLY"}
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Raw admin context
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Committed hash" value={shortenHash(draw.committed_hash)} />
                <DetailRow
                  label="Reveal seed"
                  value={draw.revealed_seed ? shortenHash(draw.revealed_seed) : "Hidden until reveal"}
                />
                <DetailRow label="Winner subscription" value={draw.winner_subscription_number || "—"} />
                <DetailRow label="Winner customer" value={draw.winner_customer_name || "—"} />
              </dl>
            </div>

            <div className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Operational note
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                Public trust pages must never expose raw phone numbers, Aadhaar, KYC IDs, internal customer identifiers, or unmasked private data.
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </PortalPage>
  );
}
