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
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            Winner history
          </Link>
          <Link
            href={ROUTES.public.howItWorks}
            className="inline-flex h-10 items-center rounded-xl border border-white/80 bg-white/80 px-4 text-sm font-semibold text-foreground shadow-[0_16px_34px_-26px_rgba(15,23,42,0.6)] transition hover:-translate-y-0.5 hover:bg-white"
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
        "relative overflow-hidden rounded-[2rem] border border-emerald-200/80 bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.18),transparent_34%),linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.88))] p-6 shadow-[0_28px_60px_-42px_rgba(6,95,70,0.45)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Latest published winner
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            {winner.customer_name || "Winner published"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Batch {winner.batch_code} · Month {winner.draw_month} · Lucky ID {winner.lucky_id || "—"} · {formatDrawDate(winner.draw_date)}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Winner benefit: remaining future EMI is waived according to the plan rules. EMI already paid stays part of the completed payment history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.winnerHistory}
            className="inline-flex h-10 items-center rounded-xl border border-white/75 bg-white/75 px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:bg-white"
          >
            View history
          </Link>
          <Link
            href={ROUTES.public.apply}
            className="inline-flex h-10 items-center rounded-xl border border-slate-900/10 bg-slate-900 px-4 text-sm font-semibold text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5"
          >
            Apply
          </Link>
        </div>
      </div>
    </section>
  );
}

