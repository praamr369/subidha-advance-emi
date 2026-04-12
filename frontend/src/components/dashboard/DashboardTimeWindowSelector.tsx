"use client";

import type { DashboardWindowPreset } from "@/services/dashboard-types";

type Props = {
  value: DashboardWindowPreset;
  startDate: string;
  endDate: string;
  loading?: boolean;
  title?: string;
  description?: string;
  onWindowChange: (value: DashboardWindowPreset) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
};

const OPTIONS: Array<{ value: DashboardWindowPreset; label: string }> = [
  { value: "DEFAULT", label: "Default view" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_30_DAYS", label: "Last 30 days" },
  { value: "CUSTOM", label: "Custom range" },
];

export default function DashboardTimeWindowSelector({
  value,
  startDate,
  endDate,
  loading = false,
  title = "Drilldown window",
  description = "Filters apply to drilldown surfaces while preserving canonical summary semantics.",
  onWindowChange,
  onStartDateChange,
  onEndDateChange,
}: Props) {
  return (
    <div className="surface-panel-elevated flex flex-col gap-3 rounded-[1.3rem] border border-border bg-card p-4 shadow-sm md:flex-row md:items-end md:justify-between">
      <div>
        <p className="enterprise-eyebrow">
          {title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Window
          <select
            value={value}
            disabled={loading}
            onChange={(event) =>
              onWindowChange(event.target.value as DashboardWindowPreset)
            }
            className="min-w-[180px] rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {value === "CUSTOM" ? (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Start date
              <input
                type="date"
                value={startDate}
                disabled={loading}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              End date
              <input
                type="date"
                value={endDate}
                disabled={loading}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
              />
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}
