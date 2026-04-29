"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import type { UnifiedReceivableResult } from "@/services/receivables";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function sourceLabel(sourceType: UnifiedReceivableResult["source_type"]): string {
  if (sourceType === "ADVANCE_EMI") return "Advance EMI";
  if (sourceType === "DIRECT_SALE") return "Direct Sale";
  return sourceType.charAt(0) + sourceType.slice(1).toLowerCase();
}

function badgeClass(sourceType: UnifiedReceivableResult["source_type"]): string {
  if (sourceType === "ADVANCE_EMI") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (sourceType === "DIRECT_SALE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (sourceType === "RENT") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-violet-200 bg-violet-50 text-violet-800";
}

export default function UnifiedReceivableSearchPanel({
  title,
  description,
  query,
  results,
  loading,
  error,
  searched,
  actionLoadingKey,
  lastPaymentSummary,
  onQueryChange,
  onSearch,
  onAdvanceEmiSelect,
}: {
  title: string;
  description: string;
  query: string;
  results: UnifiedReceivableResult[];
  loading: boolean;
  error: string | null;
  searched: boolean;
  actionLoadingKey?: string | null;
  lastPaymentSummary?: string | null;
  onQueryChange: (value: string) => void;
  onSearch: (query: string) => void;
  onAdvanceEmiSelect?: (row: UnifiedReceivableResult) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch(query);
  }

  return (
    <SectionCard title={title} description={description}>
      <form onSubmit={submit} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label htmlFor="unified-receivable-search" className="sr-only">
            Search receivables
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="unified-receivable-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by phone, contract ID, Lucky ID, batch, KYC, customer name, direct sale ref..."
              className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {lastPaymentSummary ? (
        <div className="mt-3 rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2 text-sm text-foreground">
          {lastPaymentSummary}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4">
          <LoadingBlock label="Searching receivables..." />
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {!loading && !error && searched && results.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No receivables found"
            description="No contract reference matched this search within the current role scope."
          />
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-5 space-y-3">
          {results.map((row) => {
            const key = `${row.source_type}-${row.source_id ?? row.reference_no}`;
            const route = row.collection_route?.trim() || "";
            const canEmiInline =
              row.primary_action === "COLLECT_EMI" && Boolean(onAdvanceEmiSelect);
            const canEmiRoute =
              row.primary_action === "COLLECT_EMI" && !onAdvanceEmiSelect && Boolean(route);
            const canDirectRoute =
              row.primary_action === "COLLECT_DIRECT_SALE" && Boolean(route);
            const disabledReason =
              row.disabled_reason || "Collection is not available for this receivable.";

            return (
              <div
                key={key}
                className="rounded-2xl border border-border bg-background p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(row.source_type)}`}
                      >
                        {sourceLabel(row.source_type)}
                      </span>
                      <span className="break-all text-sm font-semibold text-foreground">
                        {row.display_reference || row.reference_no}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      {row.customer_name || "Customer not linked"} ·{" "}
                      {row.phone_masked || "No phone"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {row.product_summary || "No product summary"} · Status{" "}
                      {row.status || "—"}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                        Due
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {money(row.due_amount)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-amber-700">
                        Overdue
                      </div>
                      <div className="mt-1 text-sm font-semibold text-amber-900">
                        {money(row.overdue_amount)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">
                        Next Due
                      </div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {formatDate(row.next_due_date)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {canEmiInline ? (
                    <button
                      type="button"
                      onClick={() => onAdvanceEmiSelect?.(row)}
                      disabled={actionLoadingKey === key}
                      title="Opens the in-page EMI collection workflow using the canonical route from the server."
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoadingKey === key ? "Loading EMI..." : "Use EMI Flow"}
                    </button>
                  ) : null}

                  {canEmiRoute ? (
                    <Link
                      href={route}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800"
                    >
                      Open EMI collection
                    </Link>
                  ) : null}

                  {canDirectRoute ? (
                    <Link
                      href={route}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white transition hover:bg-amber-900"
                    >
                      Open direct-sale collection
                    </Link>
                  ) : null}

                  {!canEmiInline && !canEmiRoute && !canDirectRoute ? (
                    <button
                      type="button"
                      disabled
                      title={disabledReason}
                      className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-muted-foreground"
                    >
                      {row.primary_action === "VIEW_ONLY" ? "View only" : "Collection disabled"}
                    </button>
                  ) : null}
                </div>

                {!canEmiInline && !canEmiRoute && !canDirectRoute && disabledReason ? (
                  <div className="mt-2 text-xs text-muted-foreground">{disabledReason}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </SectionCard>
  );
}
