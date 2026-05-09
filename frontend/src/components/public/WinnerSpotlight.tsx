import Link from "next/link";

import type { PublicWinner } from "@/services/public";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

function formatDrawDate(value: string | null | undefined): string {
  if (!value) return "Not published";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function WinnerSpotlight({
  winner,
  className,
}: {
  winner: PublicWinner | null;
  className?: string;
}) {
  if (!winner) {
    return (
      <section
        className={cn(
          "rounded-[2rem] border border-white/75 bg-white/80 p-6 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.62)]",
          className
        )}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Latest winner
        </div>
        <div className="mt-3 text-lg font-semibold text-foreground">
          No winner published yet
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Winner details appear here after a revealed draw is published. The public site shows empty states instead of inventing winner rows.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.winnerHistory}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
          >
            Winner history
          </Link>
          <Link
            href={ROUTES.public.howItWorks}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
          >
            How it works
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[2rem] border border-[color-mix(in_oklab,var(--border)_65%,oklch(0.55_0.06_58)_35%)] bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--accent)_35%,transparent),transparent_36%),linear-gradient(180deg,color-mix(in_oklab,white_96%,var(--surface-muted)_4%),color-mix(in_oklab,var(--surface-card-soft)_88%,oklch(0.93_0.02_75)_12%))] p-6 shadow-[0_28px_60px_-42px_rgba(60,40,20,0.18)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[color-mix(in_oklab,var(--primary)_25%,transparent)] to-transparent" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_oklab,var(--primary)_78%,var(--foreground)_22%)]">
            Latest published draw result
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Batch {winner.batch_name || winner.batch_code}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Month {winner.draw_month} · Winner Lucky ID {winner.lucky_id || "—"} ·{" "}
            {formatDrawDate(winner.draw_datetime || winner.draw_date)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Public commit hash: {winner.public_commit_hash || winner.committed_hash || "—"} · Verification{" "}
            {winner.verification_status || "unavailable"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.winnerHistory}
            className="inline-flex h-10 items-center rounded-xl border border-white/75 bg-white/75 px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/45 focus-visible:ring-offset-2"
          >
            View history
          </Link>
          <Link
            href={ROUTES.public.apply}
            className="public-action-primary h-10 !min-h-0 px-4"
          >
            Apply
          </Link>
        </div>
      </div>
    </section>
  );
}

