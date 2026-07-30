"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import PaginationControls from "@/components/ui/PaginationControls";
import CustomerPageShell, {
  CPageCard,
  CPageSection,
  CPageStats,
  CPageStat,
  CPageTabs,
} from "@/components/layout/CustomerPageShell";
import {
  listProductRequests,
  type ProductRequestRecord,
} from "@/services/product-requests";

const PAGE_SIZE = 25;

type StatusFilter = "" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

const STATUS_TABS = [
  { value: "" as StatusFilter, label: "All" },
  { value: "SUBMITTED" as StatusFilter, label: "Pending" },
  { value: "APPROVED" as StatusFilter, label: "Approved" },
  { value: "REJECTED" as StatusFilter, label: "Rejected" },
];

function formatDate(v?: string | null): string {
  if (!v) return "—";
  const d = Date.parse(v);
  if (Number.isNaN(d)) return v;
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function RequestCard({ row }: { row: ProductRequestRecord }) {
  return (
    <CPageCard href={`/customer/product-requests/${row.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-foreground truncate">
            {row.product_name || `Request #${row.id}`}
          </div>
          <div className="mt-0.5 text-xs font-mono text-muted-foreground">REQ-{row.id}</div>
        </div>
        <ERPStatusBadge status={row.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div>
          <span className="text-muted-foreground">Type</span>
          <div className="font-semibold mt-0.5">{row.request_type}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Product</span>
          <div className="font-semibold mt-0.5">{row.product_name || "—"}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Submitted</span>
          <div className="font-semibold mt-0.5">{formatDate(row.created_at)}</div>
        </div>
        {row.batch_code ? (
          <div>
            <span className="text-muted-foreground">Batch</span>
            <div className="font-semibold mt-0.5">{row.batch_code}</div>
          </div>
        ) : null}
      </div>
      {row.status === "SUBMITTED" ? (
        <div className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Awaiting admin review — not yet a live contract
        </div>
      ) : null}
    </CPageCard>
  );
}

export default function CustomerProductRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = ((searchParams.get("status") || "").trim().toUpperCase() || "") as StatusFilter;
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [rows, setRows] = useState<ProductRequestRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listProductRequests("customer", {
        status: statusFilter || undefined,
        page: currentPage,
        pageSize: PAGE_SIZE,
      });
      setRows(payload.results);
      setCount(payload.count);
      setPage(payload.page);
      setNumPages(payload.num_pages);
      setHasNext(payload.has_next);
      setHasPrevious(payload.has_previous);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests.");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const stats = useMemo(() => ({
    submitted: rows.filter((r) => r.status === "SUBMITTED").length,
    approved: rows.filter((r) => r.status === "APPROVED").length,
    rejected: rows.filter((r) => r.status === "REJECTED").length,
  }), [rows]);

  function applyFilter(s: StatusFilter) {
    const next = new URLSearchParams();
    if (s) next.set("status", s);
    router.replace(next.toString() ? `/customer/product-requests?${next.toString()}` : "/customer/product-requests");
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    router.replace(next.toString() ? `/customer/product-requests?${next.toString()}` : "/customer/product-requests");
  }

  return (
    <CustomerPageShell
      title="Product Requests"
      subtitle="Track your submitted product requests"
      actions={
        <Link
          href="/customer/catalog"
          className="flex items-center gap-1.5 rounded-xl bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
        >
          <Plus className="size-3.5" /> New
        </Link>
      }
    >
      {/* Stats */}
      {!loading && count > 0 ? (
        <CPageStats>
          <CPageStat label="Total" value={count} />
          <CPageStat label="Pending" value={stats.submitted} tone="warning" />
          <CPageStat label="Approved" value={stats.approved} tone="success" />
          <CPageStat label="Rejected" value={stats.rejected} tone={stats.rejected > 0 ? "danger" : "default"} />
        </CPageStats>
      ) : null}

      <CPageSection>
        <CPageTabs tabs={STATUS_TABS} active={statusFilter} onChange={applyFilter} />
      </CPageSection>

      {loading ? <ERPLoadingState label="Loading requests..." /> : null}

      {!loading && error ? (
        <ERPErrorState title="Unable to load requests" description={error} onRetry={() => void loadPage()} />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <ERPEmptyState
          title="No requests"
          description={statusFilter ? `No ${statusFilter.toLowerCase()} requests.` : "You haven't submitted any subscription requests yet."}
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <CPageSection>
          <div className="space-y-3">
            {rows.map((row) => <RequestCard key={row.id} row={row} />)}
          </div>
          {count > PAGE_SIZE ? (
            <div className="mt-4">
              <PaginationControls
                count={count}
                page={page}
                pageSize={PAGE_SIZE}
                numPages={numPages}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                disabled={loading}
                onPrevious={() => replacePage(Math.max(page - 1, 1))}
                onNext={() => replacePage(page + 1)}
              />
            </div>
          ) : null}
        </CPageSection>
      ) : null}

      <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        A submitted request is not a live contract. Admin approval creates the real subscription, EMI schedule, and lucky draw assignment.
      </div>
    </CustomerPageShell>
  );
}
