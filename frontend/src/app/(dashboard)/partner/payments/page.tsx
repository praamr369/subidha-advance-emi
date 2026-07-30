"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ChevronRight, RefreshCw, Search, CreditCard } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import { formatRupee } from "@/lib/utils/currency";
import { getPartnerDashboard, listPartnerPayments, type PartnerPayment } from "@/services/partner";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner payment history.";
}

export default function PartnerPaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const method = (searchParams.get("method") || "").trim();
  const customer = (searchParams.get("customer") || "").trim();
  const subscription = (searchParams.get("subscription") || "").trim();

  const [searchInput, setSearchInput] = useState(q);
  const [methodInput, setMethodInput] = useState(method);
  const [rows, setRows] = useState<PartnerPayment[]>([]);
  const [count, setCount] = useState(0);
  const [totalCollected, setTotalCollected] = useState("0.00");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
    setMethodInput(method);
  }, [q, method]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await listPartnerPayments({
          q: q || undefined,
          method: method || undefined,
          customer: customer || undefined,
          subscription: subscription || undefined,
        });

        setRows(Array.isArray(payload.results) ? payload.results : []);
        setCount(Number(payload.count || 0));
        setTotalCollected(String(payload.total_collected || "0.00"));
        setError(null);
      } catch (err) {
        if (mode === "initial") {
          try {
            const fallback = await getPartnerDashboard();
            const fallbackRows = Array.isArray(fallback.recent_verified_payments) ? fallback.recent_verified_payments : [];
            const fallbackTotal = Number(
              fallback.summary?.total_paid_amount ?? fallback.summary?.total_revenue_collected ?? 0
            );

            setRows(fallbackRows as any);
            setCount(fallbackRows.length);
            setTotalCollected(Number.isFinite(fallbackTotal) ? fallbackTotal.toFixed(2) : "0.00");
            setError(null);
          } catch {
            setError(toErrorMessage(err));
            setRows([]);
            setCount(0);
            setTotalCollected("0.00");
          }
        } else {
          setError(toErrorMessage(err));
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [customer, method, q, subscription]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const currentQuery = searchParams.toString();

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    const nextQuery = searchInput.trim();

    if (nextQuery) next.set("q", nextQuery);
    if (methodInput) next.set("method", methodInput);
    if (customer) next.set("customer", customer);
    if (subscription) next.set("subscription", subscription);

    const queryString = next.toString();
    router.replace(queryString ? `/partner/payments?${queryString}` : "/partner/payments");
  }

  function handleReset() {
    setSearchInput("");
    setMethodInput("");
    const next = new URLSearchParams();
    if (customer) next.set("customer", customer);
    if (subscription) next.set("subscription", subscription);
    const queryString = next.toString();
    router.replace(queryString ? `/partner/payments?${queryString}` : "/partner/payments");
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Payments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verified partner payments
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CreditCard className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{count}</div>
          <div className="text-xs font-medium text-muted-foreground">Total Payments</div>
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
            placeholder="Search reference, customer..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={methodInput}
            onChange={(e) => setMethodInput(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="BANK">Bank</option>
            <option value="CARD">Card</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95"
          >
            Apply
          </button>
          {(q || method) && (
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
          <LoadingBlock label="Loading payments..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadPage("initial")} />
        ) : count === 0 ? (
          <EmptyState
            title="No payments found"
            description={q || method || customer || subscription ? "No payments matched your filters." : "You have no payments yet."}
          />
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/partner/payments/${row.id}${currentQuery ? `?${currentQuery}` : ""}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CreditCard className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold text-foreground truncate">{row.customer_name || `Payment #${row.id}`}</div>
                  <div className="font-bold text-green-600 dark:text-green-500">{formatRupee(row.amount)}</div>
                </div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">{row.subscription_number || `SUB-${row.subscription}`}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.method || "UNKNOWN"} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {formatDateTime(row.created_at || row.payment_date)}
                  </span>
                </div>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
