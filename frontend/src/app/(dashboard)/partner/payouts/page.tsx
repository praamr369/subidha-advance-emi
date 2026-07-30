"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Search, Banknote, ChevronRight } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatusBadge from "@/components/ui/status-badge";
import {
  listPartnerCommissions,
  listPartnerSubscriptions,
  type PartnerCommission,
  type PartnerSubscription,
} from "@/services/partner";

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PartnerPayoutsPage() {
  const [rows, setRows] = useState<PartnerCommission[]>([]);
  const [subscriptionIndex, setSubscriptionIndex] = useState<Record<number, PartnerSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [searchInput, setSearchInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");

  const [count, setCount] = useState(0);

  const loadPayouts = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [commissionPayload, subscriptionPayload] = await Promise.all([
        listPartnerCommissions({
          q: appliedSearch || undefined,
          status: appliedStatus || undefined,
        }),
        listPartnerSubscriptions(),
      ]);
      setRows(commissionPayload.results);
      setCount(commissionPayload.results.length);
      const mapped: Record<number, PartnerSubscription> = {};
      for (const sub of subscriptionPayload.results || []) {
        mapped[sub.id] = sub;
      }
      setSubscriptionIndex(mapped);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payouts.");
      setRows([]);
      setCount(0);
      setSubscriptionIndex({});
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [appliedSearch, appliedStatus]);

  useEffect(() => {
    void loadPayouts("initial");
  }, [loadPayouts]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setAppliedStatus(statusInput.trim());
  }

  function handleReset() {
    setSearchInput("");
    setStatusInput("");
    setAppliedSearch("");
    setAppliedStatus("");
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Payout visibility
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPayouts("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Banknote className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{count}</div>
          <div className="text-xs font-medium text-muted-foreground">Total Payout Entries</div>
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
            placeholder="Search subscription or customer..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="SETTLED">Settled</option>
            <option value="REVERSED">Reversed</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95"
          >
            Apply
          </button>
          {(appliedSearch || appliedStatus) && (
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
          <LoadingBlock label="Loading payouts..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadPayouts("initial")} />
        ) : count === 0 ? (
          <EmptyState
            title="No payouts found"
            description={appliedSearch || appliedStatus ? "No entries matched your filters." : "You have no payout visibility entries."}
          />
        ) : (
          rows.map((row) => {
            const sub = row.subscription ? subscriptionIndex[row.subscription] : undefined;
            return (
              <Link
                key={row.id}
                href={row.subscription ? `/partner/subscriptions/${row.subscription}` : "#"}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
              >
                <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Banknote className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-center">
                    <div className="font-bold text-foreground truncate">
                      {row.subscription ? `SUB-${row.subscription}` : `#${row.id}`}
                    </div>
                    <div className="text-sm font-bold text-foreground">
                      {money(row.commission_amount)}
                    </div>
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                    {sub?.customer_name || "Customer unavailable"}
                    {row.emi ? ` · EMI #${row.emi}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status || "PENDING"} />
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Created {formatDate(row.created_at)}
                    </span>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
