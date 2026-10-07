"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import PaginationControls from "@/components/ui/PaginationControls";
import ERPPageShell from "@/components/erp/ERPPageShell";
import TableToolbar from "@/components/ui/TableToolbar";
import { ROUTES } from "@/lib/routes";
import ProductRequestCard from "@/domains/product-requests/components/ProductRequestCard";
import {
  listProductRequests,
  type ProductRequestRecord,
} from "@/services/product-requests";

const PAGE_SIZE = 25;

type RequestStatusFilter = "" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
type RequesterRoleFilter = "" | "CUSTOMER" | "PARTNER";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load admin subscription request register.";
}

export default function AdminProductRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = ((searchParams.get("status") || "").trim().toUpperCase() ||
    "") as RequestStatusFilter;
  const requesterRole = ((searchParams.get("requester_role") || "")
    .trim()
    .toUpperCase() || "") as RequesterRoleFilter;
  const query = (searchParams.get("q") || "").trim();
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [statusInput, setStatusInput] = useState<RequestStatusFilter>(statusFilter);
  const [requesterRoleInput, setRequesterRoleInput] = useState<RequesterRoleFilter>(requesterRole);
  const [queryInput, setQueryInput] = useState(query);

  const rqQuery = useQuery({
    queryKey: ["admin", "product-requests", statusFilter, query, currentPage],
    queryFn: () => listProductRequests("admin", {
      status: statusFilter || undefined,
      q: query || undefined,
      page: currentPage,
      pageSize: PAGE_SIZE,
    }),
  });

  const payload = rqQuery.data;
  const rows = payload?.results || [];
  const count = payload?.count || 0;
  const page = payload?.page || currentPage;
  const numPages = payload?.num_pages || 0;
  const hasNext = payload?.has_next || false;
  const hasPrevious = payload?.has_previous || false;

  const loading = rqQuery.isLoading;
  const refreshing = rqQuery.isFetching && !rqQuery.isLoading;
  const error = rqQuery.error ? toErrorMessage(rqQuery.error) : null;

  useEffect(() => {
    setStatusInput(statusFilter);
    setRequesterRoleInput(requesterRole);
    setQueryInput(query);
  }, [statusFilter, requesterRole, query]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      await rqQuery.refetch();
    },
    [rqQuery]
  );

  const summary = useMemo(() => {
    return {
      submitted: rows.filter((row) => row.status === "SUBMITTED").length,
      approved: rows.filter((row) => row.status === "APPROVED").length,
      customerRequests: rows.filter(
        (row) => row.requester_role_snapshot === "CUSTOMER"
      ).length,
    };
  }, [rows]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (statusInput) next.set("status", statusInput);
    if (requesterRoleInput) next.set("requester_role", requesterRoleInput);
    if (queryInput.trim()) next.set("q", queryInput.trim());
    router.replace(
      next.toString()
        ? `/admin/requests/product-requests?${next.toString()}`
        : "/admin/requests/product-requests"
    );
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (requesterRole) next.set("requester_role", requesterRole);
    if (query) next.set("q", query);
    if (targetPage > 1) next.set("page", String(targetPage));
    router.replace(
      next.toString()
        ? `/admin/requests/product-requests?${next.toString()}`
        : "/admin/requests/product-requests"
    );
  }

  return (
    <ERPPageShell
      eyebrow="Sales"
      title="Product Requests"
      subtitle="Admin review queue for customer and partner product requests."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Sales & Onboarding", href: "/admin/requests/product-requests" },
        { label: "Product Requests" },
      ]}
      actions={[
        {
          href: ROUTES.admin.products,
          label: "View Products",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Approval Queue", tone: "info" }}
      stats={[
        { label: "Requests", value: count },
        { label: "Page Submitted", value: summary.submitted, tone: "warning" },
        { label: "Page Approved", value: summary.approved, tone: "success" },
        { label: "Customer Requests", value: summary.customerRequests },
      ]}
    >
      <div className="space-y-6">
        <TableToolbar
          title="Review filters"
          description="Search and narrow intake queue by requester role and request status before taking approval or rejection action."
        >
          <form onSubmit={applyFilters} className="flex flex-col gap-4 xl:flex-row xl:items-end">
            <label className="space-y-2 text-sm text-foreground xl:flex-1">
              <span className="font-medium">Search</span>
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Search by customer, product, batch, request, or subscription id"
                className="h-11 w-full rounded-xl border border-border bg-background px-3"
              />
            </label>

            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Requester role</span>
              <select
                value={requesterRoleInput}
                onChange={(event) =>
                  setRequesterRoleInput(event.target.value as RequesterRoleFilter)
                }
                className="h-11 min-w-[180px] rounded-xl border border-border bg-background px-3"
              >
                <option value="">All roles</option>
                <option value="CUSTOMER">Customer</option>
                <option value="PARTNER">Partner</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-foreground">
              <span className="font-medium">Status</span>
              <select
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value as RequestStatusFilter)}
                className="h-11 min-w-[180px] rounded-xl border border-border bg-background px-3"
              >
                <option value="">All statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => void loadPage()}
                disabled={loading || refreshing}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </form>
        </TableToolbar>

        {loading ? <ERPLoadingState label="Loading admin request register..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load admin request register"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {count === 0 && !loading && !error ? (
          <div className="pt-4">
            <ERPEmptyState
              title="No Product Requests"
              description="There are no pending requests to review."
            />
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {rows.map((row) => (
                <ProductRequestCard key={row.id} request={row}  />
              ))}
            </div>

            <PaginationControls
              count={count}
              page={page}
              pageSize={PAGE_SIZE}
              numPages={numPages}
              hasNext={hasNext}
              hasPrevious={hasPrevious}
              disabled={loading || refreshing}
              onPrevious={() => replacePage(page - 1)}
              onNext={() => replacePage(page + 1)}
            />
          </div>
        )}
      </div>
    </ERPPageShell>
  );
}
