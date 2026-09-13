import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Radio,
  ScrollText,
  Store,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { HomeCopy, NoticeKind } from "@/components/public/home/home-copy";
import HomeSectionHeading from "@/components/public/home/HomeSectionHeading";
import { tone } from "@/components/public/ui/tone";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { PublicStats, PublicWinner } from "@/services/public";

type BulletinCopy = HomeCopy["bulletin"];

type Notice = {
  kind: NoticeKind;
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  cta: string;
};

const KIND_STYLES: Record<NoticeKind, string> = {
  live: "bg-[color:color-mix(in_oklab,var(--success)_16%,transparent)] text-[color:color-mix(in_oklab,var(--success)_78%,var(--foreground))]",
  rule: cn(tone.fillSoft, tone.accentText),
  policy: cn("bg-[color:color-mix(in_oklab,var(--accent)_28%,transparent)]", tone.text),
  visit: cn(tone.wash, tone.muted),
};

const count = (value: number | null | undefined) => (value ?? 0).toLocaleString("en-IN");

function formatDrawDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function buildNotices(copy: BulletinCopy, stats: PublicStats | null): Notice[] {
  const live: Notice[] = stats
    ? [
        {
          kind: "live",
          icon: Users,
          title: copy.seats.title(count(stats.batch_available_seats)),
          body: copy.seats.body(count(stats.batch_reserved_seats), count(stats.batch_total_capacity), count(stats.total_batches)),
          href: ROUTES.public.apply,
          cta: copy.seats.cta,
        },
        {
          kind: "live",
          icon: Radio,
          title: copy.members.title(count(stats.active_subscriptions)),
          body: copy.members.body(count(stats.active_rent_subscriptions), count(stats.active_lease_subscriptions)),
          href: ROUTES.public.luckyPlan,
          cta: copy.members.cta,
        },
      ]
    : [];

  return [
    ...live,
    { kind: "rule", icon: ScrollText, href: ROUTES.public.fairDraw, ...copy.fairDraw },
    { kind: "policy", icon: BadgeCheck, href: ROUTES.public.rentalLeasePolicy, ...copy.deposits },
    { kind: "visit", icon: Store, href: ROUTES.public.contact, ...copy.visit },
  ];
}

export default function HomeBulletin({
  copy,
  stats,
  winner,
}: {
  copy: BulletinCopy;
  stats: PublicStats | null;
  winner: PublicWinner | null;
}) {
  const notices = buildNotices(copy, stats);
  const drawDate = formatDrawDate(winner?.revealed_at || winner?.draw_datetime || winner?.draw_date);
  const commitHash = winner?.public_commit_hash || winner?.committed_hash || null;
  const statusKey = (winner?.verification_status || "pending").toLowerCase();
  const statusLabel = copy.statuses[statusKey] ?? statusKey.replace(/_/g, " ");

  return (
    <section id="bulletin" aria-label={copy.eyebrow} className="scroll-mt-24 space-y-6 lg:scroll-mt-64">
      <HomeSectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className={cn("flex flex-col rounded-2xl border p-5 sm:p-6", tone.surface, tone.line)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={cn("inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em]", tone.muted)}>
              <Trophy className={cn("h-4 w-4", tone.accentText)} aria-hidden="true" />
              {copy.latestResult}
            </span>
            {drawDate ? (
              <span className={cn("inline-flex items-center gap-1.5 text-xs", tone.muted)}>
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {drawDate}
              </span>
            ) : null}
          </div>

          {winner ? (
            <>
              <div className="mt-5 flex items-center gap-4">
                <div className={cn("flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl", tone.fill)}>
                  <span className={cn("text-[10px] font-semibold uppercase tracking-[0.1em]", tone.onFillMuted)}>{copy.luckyId}</span>
                  <span className="text-3xl font-semibold tabular-nums">{winner.lucky_id ?? "—"}</span>
                </div>
                <div className="min-w-0">
                  <p className={cn("text-lg font-semibold", tone.text)}>{copy.batch(winner.batch_name || winner.batch_code)}</p>
                  <p className={cn("text-sm", tone.muted)}>
                    {copy.drawMonth(winner.draw_month)}
                    {winner.winner_name_masked ? ` · ${winner.winner_name_masked}` : ""}
                  </p>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                {winner.product_name ? (
                  <div className={cn("col-span-2 rounded-xl px-3 py-2", tone.wash)}>
                    <dt className={cn("text-xs", tone.muted)}>{copy.product}</dt>
                    <dd className={cn("font-medium", tone.text)}>{winner.product_name}</dd>
                  </div>
                ) : null}
                <div className={cn("rounded-xl px-3 py-2", tone.wash)}>
                  <dt className={cn("text-xs", tone.muted)}>{copy.emisWaived}</dt>
                  <dd className={cn("font-medium", tone.text)}>
                    {winner.waived_emi_count != null ? count(winner.waived_emi_count) : copy.asPerRulebook}
                  </dd>
                </div>
                <div className={cn("rounded-xl px-3 py-2", tone.wash)}>
                  <dt className={cn("text-xs", tone.muted)}>{copy.verification}</dt>
                  <dd className={cn("font-medium capitalize", tone.text)}>{statusLabel}</dd>
                </div>
              </dl>

              {commitHash ? (
                <p className={cn("mt-4 break-all rounded-xl border border-dashed px-3 py-2 font-mono text-[11px] leading-5", tone.line, tone.muted)}>
                  {copy.commitHash}: {commitHash}
                </p>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Link href={ROUTES.public.verifyDraw} className="public-action-primary h-10 !min-h-0 px-4 text-sm">
                  {copy.verifyDraw}
                </Link>
                <Link href={ROUTES.public.winnerHistory} className="public-action-secondary h-10 !min-h-0 px-4 text-sm">
                  {copy.winnerHistory}
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-5 flex flex-1 flex-col">
              <p className={cn("text-lg font-semibold", tone.text)}>{copy.emptyTitle}</p>
              <p className={cn("mt-2 text-sm leading-6", tone.muted)}>{copy.emptyBody}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Link href={ROUTES.public.fairDraw} className="public-action-secondary h-10 !min-h-0 px-4 text-sm">
                  {copy.howDrawsWork}
                </Link>
                <Link href={ROUTES.public.winnerHistory} className="public-action-secondary h-10 !min-h-0 px-4 text-sm">
                  {copy.winnerHistory}
                </Link>
              </div>
            </div>
          )}
        </article>

        <div className={cn("rounded-2xl border", tone.surface, tone.line)}>
          <ul className={cn("divide-y", tone.divide)}>
            {notices.map((notice) => {
              const Icon = notice.icon;
              return (
                <li key={notice.title} className="flex gap-4 p-5">
                  <span className={cn("mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone.wash, tone.accentText)}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]", KIND_STYLES[notice.kind])}>
                        {copy.kinds[notice.kind]}
                      </span>
                      <h3 className={cn("text-sm font-semibold", tone.text)}>{notice.title}</h3>
                    </div>
                    <p className={cn("mt-1 text-sm leading-6", tone.muted)}>{notice.body}</p>
                    <Link
                      href={notice.href}
                      className={cn("mt-1 inline-flex items-center gap-1 text-sm font-semibold hover:underline", tone.accentText)}
                    >
                      {notice.cta}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
