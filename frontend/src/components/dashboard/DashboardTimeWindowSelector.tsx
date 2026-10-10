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
    <div className="workspace-filter-bar flex flex-col gap-3 rounded-xl p-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="enterprise-eyebrow">
          {title}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="dashboard-time-window" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Window
          </label>
          <select
            id="dashboard-time-window"
            name="dashboard-time-window"
            value={value}
            disabled={loading}
            onChange={(event) =>
              onWindowChange(event.target.value as DashboardWindowPreset)
            }
            className="min-w-[180px] rounded-xl border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
          >
            {OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {value === "CUSTOM" ? (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-start-date" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Start date
              </label>
              <input
                id="dashboard-start-date"
                name="dashboard-start-date"
                type="date"
                value={startDate}
                disabled={loading}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="rounded-xl border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="dashboard-end-date" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                End date
              </label>
              <input
                id="dashboard-end-date"
                name="dashboard-end-date"
                type="date"
                value={endDate}
                disabled={loading}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="rounded-xl border border-[color-mix(in_oklab,var(--surface-border-strong)_78%,white_22%)] bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]"
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
