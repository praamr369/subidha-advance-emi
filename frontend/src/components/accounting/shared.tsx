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
  // null/undefined means the backend hasn't returned a value — show placeholder,
  // not ₹0.00, which would falsely imply a zero balance.
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
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

function collectErrorMessages(
  value: unknown,
  prefix?: string,
): string[] {
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return [];
    return [prefix ? `${prefix}: ${cleaned}` : cleaned];
  }

  if (Array.isArray(value)) {
    const parts = value.flatMap((item) => collectErrorMessages(item));
    if (!parts.length) return [];
    return [prefix ? `${prefix}: ${parts.join(", ")}` : parts.join(", ")];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const prioritizedKeys = ["detail", "message", "error", "non_field_errors"];

  for (const key of prioritizedKeys) {
    if (!(key in record)) continue;
    const messages = collectErrorMessages(record[key]);
    if (messages.length) return messages;
  }

  return Object.entries(record)
    .filter(([key]) => !["status", "success", "data"].includes(key))
    .flatMap(([key, entry]) => collectErrorMessages(entry, key));
}

export function accountingErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    for (const key of ["body", "details"]) {
      if (!(key in errorRecord)) continue;
      const raw = errorRecord[key];
      if (raw && typeof raw === "object") {
        const structured = raw as Record<string, unknown>;
        if (structured.code === "DIRECT_SALE_FINALIZE_BLOCKED") {
          const parts: string[] = [];
          if (typeof structured.detail === "string" && structured.detail.trim()) {
            parts.push(structured.detail.trim());
          }
          if (Array.isArray(structured.blocking_reasons)) {
            parts.push(
              ...structured.blocking_reasons.map(String).filter((s) => s.trim())
            );
          }
          if (parts.length) return parts.join(" — ");
        }
      }
      const messages = collectErrorMessages(raw);
      if (messages.length) return messages.join("; ");
    }
  }

  if (error instanceof Error && error.message.trim()) return error.message;

  const messages = collectErrorMessages(error);
  if (messages.length) return messages.join("; ");

  return fallback;
}

export function accountingFieldClassName() {
  return "mt-1 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-border focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:bg-muted/50 disabled:text-muted-foreground";
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
      ? "rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm font-medium text-red-800"
      : tone === "info"
        ? "rounded-xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm font-medium text-sky-900"
        : "rounded-xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm font-medium text-emerald-900";
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
    <div className="surface-subtle rounded-xl border p-4">
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
