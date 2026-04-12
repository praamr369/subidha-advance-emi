"use client";

import { RefreshCw } from "lucide-react";

import ActionButton from "@/components/ui/ActionButton";

type PeriodFiltersProps = {
  startDate?: string;
  endDate?: string;
  asOf?: string;
  onStartDateChange?: (value: string) => void;
  onEndDateChange?: (value: string) => void;
  onAsOfChange?: (value: string) => void;
  asOfLabel?: string;
};

export function accountingMoney(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

export function accountingDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function accountingErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function accountingFieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:bg-[var(--surface-muted)] disabled:text-muted-foreground";
}

export function AccountingNotice({
  tone = "success",
  message,
}: {
  tone?: "success" | "danger" | "info";
  message: string;
}) {
  const className =
    tone === "danger"
      ? "rounded-2xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
      : tone === "info"
        ? "rounded-2xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm font-medium text-sky-900"
        : "rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-900";
  return <div className={className}>{message}</div>;
}

export function AccountingRefreshButton({
  loading,
  refreshing,
  onClick,
}: {
  loading?: boolean;
  refreshing?: boolean;
  onClick: () => void;
}) {
  return (
    <ActionButton
      variant="outline"
      onClick={onClick}
      disabled={loading || refreshing}
      leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
    >
      {refreshing ? "Refreshing..." : "Refresh"}
    </ActionButton>
  );
}

export function AccountingPeriodFilters({
  startDate,
  endDate,
  asOf,
  onStartDateChange,
  onEndDateChange,
  onAsOfChange,
  asOfLabel = "As of",
}: PeriodFiltersProps) {
  return (
    <div className="surface-subtle rounded-2xl border p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Period filters
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {onStartDateChange ? (
          <label className="text-sm font-medium text-muted-foreground">
            Start date
            <input
              type="date"
              value={startDate ?? ""}
              onChange={(event) => onStartDateChange(event.target.value)}
              className={accountingFieldClassName()}
            />
          </label>
        ) : null}

        {onEndDateChange ? (
          <label className="text-sm font-medium text-muted-foreground">
            End date
            <input
              type="date"
              value={endDate ?? ""}
              onChange={(event) => onEndDateChange(event.target.value)}
              className={accountingFieldClassName()}
            />
          </label>
        ) : null}

        {onAsOfChange ? (
          <label className="text-sm font-medium text-muted-foreground">
            {asOfLabel}
            <input
              type="date"
              value={asOf ?? ""}
              onChange={(event) => onAsOfChange(event.target.value)}
              className={accountingFieldClassName()}
            />
          </label>
        ) : null}
      </div>
    </div>
  );
}
