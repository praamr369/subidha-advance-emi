"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { ROUTES } from "@/lib/routes";
import {
  getPublicLatestWinner,
  type PublicWinner,
} from "@/services/public";

function formatDrawDate(value: string | null | undefined): string {
  if (!value) return "Not published";

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

export default function PublicLatestWinnerWidget() {
  const [winner, setWinner] = useState<PublicWinner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWinner = useCallback(async () => {
    setLoading(true);

    try {
      const payload = await getPublicLatestWinner();
      setWinner(payload.winner);
      setError(null);
    } catch (err) {
      setWinner(null);
      setError(err instanceof Error ? err.message : "Unable to load the latest winner.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWinner();
  }, [loadWinner]);

  if (loading) {
    return <LoadingBlock label="Loading latest winner..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Latest winner unavailable"
        description={error}
        onRetry={() => void loadWinner()}
      />
    );
  }

  if (!winner) {
    return (
      <EmptyState
        title="No winner published yet"
        description="Latest winner details will appear here after a revealed lucky draw is published."
      />
    );
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-emerald-200/80 bg-[radial-gradient(circle_at_top_right,rgba(110,231,183,0.18),transparent_34%),linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.88))] p-5 shadow-[0_28px_60px_-42px_rgba(6,95,70,0.45)]">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Latest Published Draw Result
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Batch {winner.batch_name || winner.batch_code}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Draw month {winner.draw_month} · Winner Lucky ID {winner.lucky_id || "—"} ·
            Published {formatDrawDate(winner.draw_datetime || winner.draw_date)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Public commit hash: {winner.public_commit_hash || winner.committed_hash || "—"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Verification status: {winner.verification_status || "unavailable"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.winnerHistory}
            className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:-translate-y-0.5 hover:bg-card"
          >
            View Winner History
          </Link>
          <Link
            href={ROUTES.public.apply}
            className="inline-flex h-10 items-center rounded-xl border border-foreground/15 bg-foreground px-4 text-sm font-medium text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5"
          >
            Apply Now
          </Link>
        </div>
      </div>
    </div>
  );
}
