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
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Latest Published Winner
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            {winner.customer_name || "Winner published"}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Batch {winner.batch_code} · Month {winner.draw_month} · Lucky ID{" "}
            {winner.lucky_id || "—"} · Published {formatDrawDate(winner.draw_date)}
          </p>
          {winner.product_name ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Product context: {winner.product_name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={ROUTES.public.winnerHistory}
            className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            View Winner History
          </Link>
          <Link
            href={ROUTES.public.apply}
            className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
          >
            Apply Now
          </Link>
        </div>
      </div>
    </div>
  );
}
