"use client";
import { useI18n } from "@/components/i18n/I18nProvider";

import { useCallback, useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { getPublicStats, type PublicStats } from "@/services/public";

export default function PublicStatsWidget() {
  const { t } = useI18n();
    const statCards = [
      {
        key: "total_batches",
        label: t('public.PublicStatsWidget_prop1'),
        helper: "Batches created in the live system",
      },
      {
        key: "total_subscriptions",
        label: t('public.PublicStatsWidget_prop2'),
        helper: "All recorded subscriptions",
      },
      {
        key: "active_subscriptions",
        label: t('public.PublicStatsWidget_prop3'),
        helper: "Currently running contracts",
      },
      {
        key: "total_winners",
        label: t('public.PublicStatsWidget_prop4'),
        helper: "Winner records already revealed",
      },
    ] as const;

  const [stats, setStats] = useState<PublicStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);

    try {
      const payload = await getPublicStats();
      setStats(payload);
      setError(null);
    } catch (err) {
      setStats(null);
      setError(err instanceof Error ? err.message : "Unable to load live public stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (loading) {
    return <LoadingBlock label={t('public.PublicStatsWidget_attr5')} />;
  }

  if (error) {
    return (
      <ErrorState
        title={t('public.PublicStatsWidget_attr6')}
        description={error}
        onRetry={() => void loadStats()}
      />
    );
  }

  if (!stats) {
    return (
      <EmptyState
        title={t('public.PublicStatsWidget_attr7')}
        description={t('public.PublicStatsWidget_attr8')}
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map((card) => {
        const value = stats[card.key];

        return (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-[1.8rem] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] dark:bg-[linear-gradient(180deg,rgba(30,41,59,0.5),rgba(15,23,42,0.8))] p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.65)] dark:shadow-none"
          >
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent" />
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {card.label}
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              {typeof value === "number" ? value.toLocaleString("en-IN") : "—"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {card.helper}
            </p>
          </div>
        );
      })}
    </div>
  );
}
