"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { accountingMoney } from "@/components/accounting/shared";
import { cn } from "@/lib/utils";
import type {
  FinancialActionItem,
  FinancialIntelligenceSection,
  FinancialStatus,
} from "@/services/financial-intelligence";

const STATUS_STYLES: Record<FinancialStatus, string> = {
  OK: "border-emerald-200 bg-emerald-50 text-emerald-800",
  INFO: "border-sky-200 bg-sky-50 text-sky-800",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800",
  CRITICAL: "border-red-200 bg-red-50 text-red-800",
};

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
  OK: 3,
};

export function FinancialStatusBadge({
  status,
  deferred,
}: {
  status?: FinancialStatus | null;
  deferred?: boolean;
}) {
  const safeStatus: FinancialStatus =
    status && status in STATUS_STYLES ? status : "INFO";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide",
        STATUS_STYLES[safeStatus]
      )}
    >
      {deferred ? "DEFERRED" : safeStatus}
    </span>
  );
}

export function FinancialSectionCard({
  title,
  section,
  children,
}: {
  title: string;
  section: FinancialIntelligenceSection;
  children?: ReactNode;
}) {
  const warnings = Array.isArray(section.warnings) ? section.warnings : [];

  return (
    <article className="rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <FinancialStatusBadge status={section.status} deferred={section.deferred} />
      </div>
      {section.message ? (
        <p className="mt-3 text-sm text-muted-foreground">{section.message}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 border-t border-border pt-3 text-xs text-amber-800">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function FinancialMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl bg-muted/40 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FinancialActionItemsList({
  items,
  emptyLabel = "No action items returned for this period.",
}: {
  items?: FinancialActionItem[] | null;
  emptyLabel?: string;
}) {
  const safeItems = Array.isArray(items) ? items : [];

  if (safeItems.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  const sorted = [...safeItems].sort(
    (left, right) =>
      (SEVERITY_RANK[left.severity] ?? 9) - (SEVERITY_RANK[right.severity] ?? 9)
  );

  return (
    <ul className="space-y-3">
      {sorted.map((item) => (
        <li key={item.key} className="rounded-xl border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <FinancialStatusBadge status={item.severity} deferred={item.deferred} />
                <span className="font-semibold text-foreground">{item.title}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">Source: {item.source_area}</p>
            </div>
            <div className="text-right text-sm">
              {item.count > 0 ? <div className="font-semibold">{item.count}</div> : null}
              {item.amount != null ? (
                <div className="text-muted-foreground">{accountingMoney(item.amount)}</div>
              ) : null}
              {item.action_url ? (
                <Link
                  href={item.action_url}
                  className="mt-2 inline-block font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open source
                </Link>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function PeriodSelector({
  year,
  month,
  asOf,
  onYearChange,
  onMonthChange,
  onAsOfChange,
}: {
  year: number;
  month: number;
  asOf: string;
  onYearChange: (value: number) => void;
  onMonthChange: (value: number) => void;
  onAsOfChange: (value: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-medium text-muted-foreground">
        Year
        <select
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
        >
          {years.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        Month
        <select
          value={month}
          onChange={(event) => onMonthChange(Number(event.target.value))}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => (
            <option key={option} value={option}>
              {new Date(2026, option - 1, 1).toLocaleString("en-IN", { month: "long" })}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-muted-foreground">
        As of
        <input
          type="date"
          value={asOf}
          onChange={(event) => onAsOfChange(event.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
        />
      </label>
    </div>
  );
}
