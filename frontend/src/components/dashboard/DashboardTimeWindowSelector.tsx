"use client";

import type { DashboardWindowPreset } from "@/services/dashboard-types";

type Props = {
  value: DashboardWindowPreset;
  startDate: string;
  endDate: string;
  loading?: boolean;
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
  onWindowChange,
  onStartDateChange,
  onEndDateChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.3rem] border border-slate-200/80 bg-white/80 p-4 shadow-sm md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Drilldown window
        </p>
        <p className="mt-1 text-sm text-slate-600">
          Filters apply to the Phase-2 drilldown surfaces while preserving the default canonical summary semantics.
        </p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Window
          <select
            value={value}
            disabled={loading}
            onChange={(event) =>
              onWindowChange(event.target.value as DashboardWindowPreset)
            }
            className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
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
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Start date
              <input
                type="date"
                value={startDate}
                disabled={loading}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              End date
              <input
                type="date"
                value={endDate}
                disabled={loading}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900"
              />
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}
