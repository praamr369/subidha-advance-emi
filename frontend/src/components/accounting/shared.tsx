"use client";

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
  return "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground";
}

export function AccountingNotice({
  tone = "success",
  message,
}: {
  tone?: "success" | "danger";
  message: string;
}) {
  const className =
    tone === "danger"
      ? "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
      : "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";
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
    <button
      type="button"
      onClick={onClick}
      disabled={loading || refreshing}
      className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
    >
      {refreshing ? "Refreshing..." : "Refresh"}
    </button>
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
    <div className="grid gap-3 md:grid-cols-3">
      {onStartDateChange ? (
        <label className="text-sm text-muted-foreground">
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
        <label className="text-sm text-muted-foreground">
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
        <label className="text-sm text-muted-foreground">
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
  );
}
