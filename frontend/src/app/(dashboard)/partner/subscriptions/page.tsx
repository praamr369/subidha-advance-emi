"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight, RefreshCw, Search, FileText } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PaginationControls from "@/components/ui/PaginationControls";
import StatusBadge from "@/components/ui/status-badge";
import {
  listPartnerSubscriptionsRegister,
  type PartnerSubscriptionRegisterResponse,
} from "@/services/partner/registers";
import type { PartnerSubscription } from "@/services/partner";

const PAGE_SIZE = 25;

function formatMoney(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function toNumber(value?: string | number | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load subscriptions.";
}

type FilterStatus = "" | "ACTIVE" | "COMPLETED" | "WON" | "DEFAULTED";

function getOutstandingAmount(row: PartnerSubscription): number {
  if (row.outstanding_amount !== undefined && row.outstanding_amount !== null) {
    return toNumber(row.outstanding_amount);
  }
  return toNumber(row.financial_summary?.outstanding_amount);
}

export default function PartnerSubscriptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const customerFilter = (searchParams.get("customer") || "").trim();
  const initialStatus = ((searchParams.get("status") || "").trim().toUpperCase() || "") as FilterStatus;
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [rows, setRows] = useState<PartnerSubscription[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [statusInput, setStatusInput] = useState<FilterStatus>(initialStatus);

  useEffect(() => {
    setSearchInput(q);
    setStatusInput(initialStatus);
    setPage(currentPage);
  }, [initialStatus, q, currentPage]);

  const loadSubscriptions = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const response: PartnerSubscriptionRegisterResponse =
          await listPartnerSubscriptionsRegister({
            status: initialStatus || undefined,
            customer: customerFilter || undefined,
            q: q || undefined,
            page: currentPage,
            pageSize: PAGE_SIZE,
          });

        setRows(Array.isArray(response.results) ? response.results : []);
        setCount(response.count);
        setPage(response.page);
        setNumPages(response.num_pages);
        setHasNext(response.has_next);
        setHasPrevious(response.has_previous);
        setError(null);
      } catch (err) {
        setError(normalizeError(err));
        setRows([]);
        setCount(0);
        setNumPages(0);
        setHasNext(false);
        setHasPrevious(false);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [currentPage, customerFilter, initialStatus, q]
  );

  useEffect(() => {
    void loadSubscriptions("initial");
  }, [loadSubscriptions]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    const nextQuery = searchInput.trim();

    if (nextQuery) next.set("q", nextQuery);
    if (statusInput) next.set("status", statusInput);
    if (customerFilter) next.set("customer", customerFilter);

    const queryString = next.toString();
    router.replace(queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions");
  }

  function handleReset() {
    setSearchInput("");
    setStatusInput("");
    const next = new URLSearchParams();
    if (customerFilter) next.set("customer", customerFilter);
    const queryString = next.toString();
    router.replace(queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions");
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (initialStatus) next.set("status", initialStatus);
    if (customerFilter) next.set("customer", customerFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    const queryString = next.toString();
    router.replace(queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions");
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your partner subscriptions
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSubscriptions("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FileText className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{count}</div>
          <div className="text-xs font-medium text-muted-foreground">Total Subscriptions</div>
        </div>
      </div>

      {/* Search & Filters */}
      <form onSubmit={handleApplyFilters} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search customer, phone, product..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value as FilterStatus)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="WON">Won</option>
            <option value="DEFAULTED">Defaulted</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95"
          >
            Apply
          </button>
          {(q || initialStatus) && (
            <button
              type="button"
              onClick={handleReset}
              className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground active:scale-95"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingBlock label="Loading subscriptions..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadSubscriptions("initial")} />
        ) : count === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description={q || initialStatus || customerFilter ? "No subscriptions matched your filters." : "You have no subscriptions yet."}
          />
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/partner/subscriptions/${row.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                #{row.lucky_number ?? "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-foreground text-sm truncate">{row.subscription_number || `SUB-${row.id}`}</div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">{row.customer_name || "—"} · {row.customer_phone || ""}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status || "PENDING"} />
                  {getOutstandingAmount(row) > 0 ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Due {formatMoney(getOutstandingAmount(row))}
                    </span>
                  ) : null}
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
            </Link>
          ))
        )}

        {/* Pagination */}
        {count > 0 ? (
          <div className="pt-4">
            <PaginationControls
              count={count}
              page={page}
              pageSize={PAGE_SIZE}
              numPages={numPages}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              disabled={loading || refreshing}
              onPrevious={() => replacePage(Math.max(page - 1, 1))}
              onNext={() => replacePage(page + 1)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
