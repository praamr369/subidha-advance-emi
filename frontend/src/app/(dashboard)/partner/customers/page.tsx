"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight, RefreshCw, Search, Users } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PaginationControls from "@/components/ui/PaginationControls";
import StatusBadge from "@/components/ui/status-badge";
import {
  listPartnerCustomersRegister,
  listPartnerSubscriptionsRegister,
  type PartnerCustomerRegisterResponse,
} from "@/services/partner/registers";
import type { PartnerCustomer } from "@/services/partner";

const PAGE_SIZE = 25;

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customers.";
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

type KycFilter = "" | "NOT_PROVIDED" | "PENDING" | "APPROVED" | "VERIFIED" | "REJECTED";

export default function PartnerCustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") || "").trim();
  const kycStatus = ((searchParams.get("kyc_status") || "").trim().toUpperCase() || "") as KycFilter;
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [rows, setRows] = useState<PartnerCustomer[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);
  const [kycInput, setKycInput] = useState<KycFilter>(kycStatus);

  useEffect(() => {
    setSearchInput(q);
    setKycInput(kycStatus);
    setPage(currentPage);
  }, [kycStatus, q, currentPage]);

  const loadCustomers = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const data: PartnerCustomerRegisterResponse = await listPartnerCustomersRegister({
          q: q || undefined,
          kycStatus: kycStatus || undefined,
          page: currentPage,
          pageSize: PAGE_SIZE,
        });
        let resolvedRows = Array.isArray(data.results) ? data.results : [];
        let resolvedCount = data.count;
        if (resolvedRows.length === 0) {
          const fallbackSubscriptions = await listPartnerSubscriptionsRegister({
            q: q || undefined,
            page: 1,
            pageSize: 200,
          });
          const customerMap = new Map<number, PartnerCustomer>();
          for (const sub of fallbackSubscriptions.results) {
            if (!sub.customer) continue;
            if (customerMap.has(sub.customer)) continue;
            customerMap.set(sub.customer, {
              id: sub.customer,
              name: sub.customer_name || `Customer #${sub.customer}`,
              phone: sub.customer_phone || "",
              kyc_status: "NOT_PROVIDED",
              created_at: sub.created_at || "",
            });
          }
          resolvedRows = Array.from(customerMap.values());
          resolvedCount = resolvedRows.length;
        }

        setRows(resolvedRows);
        setCount(resolvedCount);
        setPage(data.page);
        setNumPages(data.num_pages);
        setHasNext(data.has_next);
        setHasPrevious(data.has_previous);
        setError(null);
      } catch (err) {
        setError(normalizeError(err));
        setRows([]);
        setCount(0);
        setNumPages(0);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [currentPage, kycStatus, q]
  );

  useEffect(() => {
    void loadCustomers("initial");
  }, [loadCustomers]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    const nextQuery = searchInput.trim();

    if (nextQuery) next.set("q", nextQuery);
    if (kycInput) next.set("kyc_status", kycInput);

    const queryString = next.toString();
    router.replace(queryString ? `/partner/customers?${queryString}` : "/partner/customers");
  }

  function handleReset() {
    setSearchInput("");
    setKycInput("");
    router.replace("/partner/customers");
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (kycStatus) next.set("kyc_status", kycStatus);
    if (targetPage > 1) next.set("page", String(targetPage));
    const queryString = next.toString();
    router.replace(queryString ? `/partner/customers?${queryString}` : "/partner/customers");
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your registered customers
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCustomers("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Users className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{count}</div>
          <div className="text-xs font-medium text-muted-foreground">Total Customers</div>
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
            placeholder="Search name or phone..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={kycInput}
            onChange={(e) => setKycInput(e.target.value as KycFilter)}
            className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All KYC Status</option>
            <option value="NOT_PROVIDED">Not Provided</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95"
          >
            Apply
          </button>
          {(q || kycStatus) && (
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
          <LoadingBlock label="Loading customers..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadCustomers("initial")} />
        ) : count === 0 ? (
          <EmptyState
            title="No customers found"
            description={q || kycStatus ? "No customers matched your filters." : "You have no customers yet."}
          />
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/partner/customers/${row.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition active:scale-95"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
                {(row.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-foreground truncate">{row.name}</div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.phone || "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.kyc_status || "NOT_PROVIDED"} />
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Added {formatDate(row.created_at)}
                  </span>
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
