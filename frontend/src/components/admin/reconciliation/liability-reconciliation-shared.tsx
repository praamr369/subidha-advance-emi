"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";

import { accountingMoney } from "@/components/accounting/shared";
import { FinancialStatusBadge } from "@/components/admin/accounting/financial-intelligence";
import type { FinancialCheck } from "@/services/financial-intelligence";
import { cn } from "@/lib/utils";

const MAPPINGS_HREF = "/admin/accounting/setup";

/**
 * Posted GL liability balance with an inline variance badge.
 *  - null balance  → deferred, with a link to configure the account mapping
 *  - matches === true  → green "matched" badge
 *  - matches === false → amber/red variance badge showing the signed difference
 */
export function PostedGlBalance({
  value,
  difference,
  matches,
}: {
  value?: string | null;
  difference?: string | null;
  matches?: boolean | null;
}) {
  if (value == null) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
          <MinusCircle className="h-3.5 w-3.5" />
          Deferred
        </span>
        <Link
          href={MAPPINGS_HREF}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Configure account mapping
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </span>
    );
  }

  const isMatch = matches === true;
  const diffNumber = difference != null ? Number(difference) : null;
  const showDiff = diffNumber != null && diffNumber !== 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold tabular-nums">{accountingMoney(value)}</span>
      {isMatch ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Matched
        </span>
      ) : showDiff ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            Math.abs(diffNumber) > 1000
              ? "bg-red-500/15 text-red-600 dark:text-red-400"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
          )}
          title="Posted GL balance − expected liability"
        >
          <AlertTriangle className="h-3 w-3" />
          {diffNumber > 0 ? "+" : ""}
          {accountingMoney(difference ?? "0")}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Diagnostic check cards. Renders the backend-supplied action_url as a
 * clickable remediation link when present.
 */
export function CheckList({ checks }: { checks?: FinancialCheck[] | null }) {
  const safeChecks = Array.isArray(checks) ? checks : [];

  if (safeChecks.length === 0) {
    return <p className="text-sm text-muted-foreground">No checks returned.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {safeChecks.map((check, index) => (
        <article
          key={`${check.key}-${index}`}
          className="rounded-xl border border-border bg-background p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-semibold">{check.title ?? check.label ?? check.key}</div>
            <FinancialStatusBadge status={check.status} deferred={check.deferred} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{check.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {check.count > 0 ? (
              <p className="text-xs font-medium">Affected records: {check.count}</p>
            ) : null}
            {check.action_url ? (
              <Link
                href={check.action_url}
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
              >
                Resolve
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
