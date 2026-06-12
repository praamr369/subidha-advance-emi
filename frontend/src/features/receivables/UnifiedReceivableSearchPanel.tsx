"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { type FormEvent } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import { TableSkeleton } from "@/components/feedback/Skeleton";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import type { UnifiedReceivableResult, UnifiedReceivableResultType } from "@/services/receivables";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function badgeLabel(kind: UnifiedReceivableResultType | ""): string {
  if (!kind) return "";
  if (kind === "EMI") return "EMI";
  if (kind === "DIRECT_SALE") return "Direct Sale";
  if (kind === "DIRECT_SALE_DRAFT") return "Direct Sale Draft";
  if (kind === "DIRECT_SALE_RECEIVABLE") return "Direct Sale Receivable";
  if (kind === "DIRECT_SALE_PAID") return "Direct Sale Paid";
  if (kind === "RENT") return "Rent";
  if (kind === "LEASE") return "Lease";
  if (kind === "DEPOSIT") return "Deposit";
  if (kind === "RECEIPT") return "Receipt";
  if (kind === "CUSTOMER") return "Customer";
  return kind;
}

function badgeClass(kind: UnifiedReceivableResultType | ""): string {
  if (kind === "EMI") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "DIRECT_SALE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (kind === "DIRECT_SALE_DRAFT") return "border-orange-200 bg-orange-50 text-orange-800";
  if (kind === "DIRECT_SALE_RECEIVABLE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (kind === "DIRECT_SALE_PAID") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (kind === "RENT") return "border-blue-200 bg-blue-50 text-blue-800";
  if (kind === "LEASE") return "border-violet-200 bg-violet-50 text-violet-800";
  if (kind === "DEPOSIT") return "border-slate-200 bg-slate-50 text-slate-800";
  if (kind === "RECEIPT") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (kind === "CUSTOMER") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900";
  return "border-border bg-muted text-foreground";
}

function routeToAdminCopy(row: UnifiedReceivableResult): boolean {
  const rt = row.result_type || "";
  return (
    row.primary_action === "VIEW_ONLY" &&
    (rt === "RENT" || rt === "LEASE" || rt === "DEPOSIT")
  );
}

function disabledActionLabel(row: UnifiedReceivableResult): string {
  if (routeToAdminCopy(row)) return "Route to admin";
  if (row.primary_action === "VIEW_ONLY") return "View only";
  return "Collection disabled";
}

function shouldShowRentLeaseEvidence(row: UnifiedReceivableResult): boolean {
  return row.source_type === "RENT" || row.source_type === "LEASE";
}

export default function UnifiedReceivableSearchPanel({
  title,
  description,
  searchHelperText,
  emptyStateDescription,
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
  onRetrySearch,
}: {
  title: string;
  description: string;
  searchHelperText?: string;
  emptyStateDescription?: string;
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
  onRetrySearch?: () => void;
}) {
  const helperId = "unified-receivable-search-helper";
  const resolvedHelper =
    searchHelperText ??
    "Search by phone, customer ID, contract ID, subscription ID, invoice number, or receipt number.";

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
              placeholder="Phone, IDs, invoice no., receipt no., contract ref…"
              aria-describedby={helperId}
              className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35"
            />
          </div>
          <p id={helperId} className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {resolvedHelper}
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center self-start rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 lg:self-auto"
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
        <section className="mt-4" aria-busy="true" aria-label="Searching receivables">
          <div aria-hidden="true">
            <TableSkeleton rows={4} columns={4} />
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="mt-4">
          <ErrorState
            title="Search failed"
            description={error}
            onRetry={onRetrySearch ? () => onRetrySearch() : undefined}
          />
        </div>
      ) : null}

      {!loading && !error && searched && results.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No receivables matched"
            description={emptyStateDescription ?? "Try another phone number, subscription ID, invoice number, or receipt number. Results respect your cashier role scope."}
          />
        </div>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-5 space-y-3">
          {results.map((row) => {
            const rowKey = `${row.source_type}-${row.source_id ?? row.reference_no}-${row.contract_reference_id ?? ""}`;
            const loadingKey = `${row.source_type}-${row.source_id ?? row.reference_no}`;
            const route = row.collection_route?.trim() || "";
            const primaryBadge = row.result_type || "";
            const extras = row.secondary_badges ?? [];
            const canEmiInline = row.primary_action === "COLLECT_EMI" && Boolean(onAdvanceEmiSelect);
            const canEmiRoute = row.primary_action === "COLLECT_EMI" && !onAdvanceEmiSelect && Boolean(route);
            const canDirectRoute = row.primary_action === "COLLECT_DIRECT_SALE" && Boolean(route);
            const canRentLeaseRoute = row.primary_action === "COLLECT_RENT_LEASE" && Boolean(route);
            const canOpenSaleRoute = row.primary_action === "OPEN_SALE" && Boolean(route);
            const canViewReceiptsRoute = row.primary_action === "VIEW_RECEIPTS" && Boolean(route);
            const disabledReason = row.reason_if_not_collectible || row.disabled_reason || "Collection is not available for this receivable.";
            const noAction = !canEmiInline && !canEmiRoute && !canDirectRoute && !canRentLeaseRoute && !canOpenSaleRoute && !canViewReceiptsRoute;
            const showSourceEvidence = shouldShowRentLeaseEvidence(row);

            return (
              <div key={rowKey} className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {primaryBadge ? (
                        <span data-testid={`unified-receivable-badge-${primaryBadge}`} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(primaryBadge)}`}>
                          {badgeLabel(primaryBadge)}
                        </span>
                      ) : null}
                      {extras.map((kind) => (
                        <span key={kind} data-testid={`unified-receivable-extra-${kind}`} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeClass(kind)}`}>
                          {badgeLabel(kind)}
                        </span>
                      ))}
                      <span className="break-all text-sm font-semibold text-foreground">
                        {row.display_reference || row.reference_no}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-foreground">
                      {row.customer_name || "Customer not linked"} · {row.phone_masked || "No phone"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {row.product_summary || "No product summary"} · Status {row.status || "—"}
                    </div>
                    {row.source_type === "DIRECT_SALE" || row.source_type === "RENT" || row.source_type === "LEASE" ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Paid {money(row.paid_amount)} of {money(row.total_amount)} · {row.payment_state || "UNPAID"}
                      </div>
                    ) : null}
                    {showSourceEvidence ? (
                      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">
                        <div className="font-semibold">Rent/lease source evidence</div>
                        <div className="mt-1">
                          Demand: {row.demand_id ? `#${row.demand_id}` : "—"} {row.demand_type ? `· ${row.demand_type}` : ""}
                        </div>
                        {row.latest_collection_number ? (
                          <div className="mt-1 break-all">
                            Latest evidence: {row.latest_collection_number} · {money(row.latest_collection_amount)} · {row.latest_collection_method || "method not exposed"} · {formatDate(row.latest_collection_date)}
                          </div>
                        ) : (
                          <div className="mt-1">No monthly collection evidence recorded yet.</div>
                        )}
                        <div className="mt-1 text-blue-900/80">Accounting bridge posting remains deferred; this only displays the source contract.</div>
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[360px]">
                    <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">Due</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{money(row.due_amount)}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-amber-700">Overdue</div>
                      <div className="mt-1 text-sm font-semibold text-amber-900">{money(row.overdue_amount)}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-[var(--surface-muted)] px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase text-muted-foreground">Next Due</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{formatDate(row.next_due_date)}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {canEmiInline ? (
                    <button type="button" data-testid="unified-receivable-open-emi-flow" onClick={() => onAdvanceEmiSelect?.(row)} disabled={actionLoadingKey === loadingKey} title="Opens the in-page EMI collection workflow using the canonical route from the server." className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60">
                      {actionLoadingKey === loadingKey ? "Loading EMI..." : "Use EMI Flow"}
                    </button>
                  ) : null}

                  {canEmiRoute ? <Link href={route} data-testid="unified-receivable-open-emi-link" className="inline-flex h-10 items-center justify-center rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800">Open EMI collection</Link> : null}
                  {canDirectRoute ? <Link href={route} data-testid="unified-receivable-open-direct-sale-link" className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-800 px-4 text-sm font-semibold text-white transition hover:bg-amber-900">Open direct-sale collection</Link> : null}
                  {canRentLeaseRoute ? <Link href={route} data-testid="unified-receivable-open-rent-lease-link" className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800">Open rent/lease collection</Link> : null}
                  {canOpenSaleRoute ? <Link href={route} data-testid="unified-receivable-open-sale-link" className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-700 px-4 text-sm font-semibold text-white transition hover:bg-orange-800">Open sale</Link> : null}
                  {canViewReceiptsRoute ? <Link href={route} data-testid="unified-receivable-open-receipts-link" className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-800">View receipts</Link> : null}

                  {noAction ? (
                    <button type="button" disabled title={disabledReason} data-testid="unified-receivable-disabled-action" className="inline-flex h-10 cursor-not-allowed items-center justify-center rounded-xl border border-border bg-muted px-4 text-sm font-semibold text-muted-foreground">
                      {disabledActionLabel(row)}
                    </button>
                  ) : null}
                </div>

                {noAction && disabledReason ? <div className="mt-2 text-xs text-muted-foreground">{disabledReason}</div> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </SectionCard>
  );
}
