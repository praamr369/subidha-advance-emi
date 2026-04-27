"use client";

import EmptyState from "@/components/feedback/EmptyState";

type Payload = {
  labels?: string[];
  series?: Array<{ name?: string; data?: Array<string | number> }>;
  meta?: { source?: string; empty_reason?: string | null };
};

export default function Phase5ChartBlock({ payload }: { payload: Payload | null }) {
  if (!payload) return <EmptyState title="No data" description="Report payload is empty." />;
  const labels = payload.labels ?? [];
  const series = payload.series ?? [];
  if (!labels.length || !series.length) {
    return (
      <EmptyState
        title="No chart rows"
        description={payload.meta?.empty_reason || "No rows are available for the selected filters."}
      />
    );
  }

  const primary = series[0];
  const max = Math.max(
    1,
    ...((primary.data ?? []).map((value) => Number(value || 0)).filter((n) => Number.isFinite(n)) as number[])
  );

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">Source: {payload.meta?.source || "unknown"}</div>
      {(primary.data ?? []).map((value, idx) => {
        const n = Number(value || 0);
        const width = `${Math.max(2, Math.round((n / max) * 100))}%`;
        return (
          <div key={`${labels[idx]}-${idx}`} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{labels[idx] || `Row ${idx + 1}`}</span>
              <span className="text-muted-foreground">{String(value)}</span>
            </div>
            <div className="h-2 rounded bg-muted">
              <div className="h-full rounded bg-primary" style={{ width }} aria-hidden />
            </div>
          </div>
        );
      })}
    </div>
  );
}

