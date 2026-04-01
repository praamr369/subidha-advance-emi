"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import {
  listAdminSupportRequests,
  type AdminSupportRequest,
  type AdminSupportRequestStatus,
} from "@/services/admin-support-requests";

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
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
  return "Failed to load support requests.";
}

function normalizeStatusFilter(value: string): AdminSupportRequestStatus | "" {
  if (value === "SUBMITTED" || value === "UNDER_REVIEW" || value === "CLOSED") {
    return value;
  }
  return "";
}

export default function AdminSupportRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = (searchParams.get("q") || "").trim();
  const statusFilter = normalizeStatusFilter(
    (searchParams.get("status") || "").trim().toUpperCase()
  );
  const categoryFilter = (searchParams.get("category") || "").trim();
  const currentQuery = searchParams.toString();

  const [searchInput, setSearchInput] = useState(q);
  const [statusInput, setStatusInput] = useState(statusFilter);
  const [categoryInput, setCategoryInput] = useState(categoryFilter);
  const [rows, setRows] = useState<AdminSupportRequest[]>([]);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({
    total: 0,
    submitted: 0,
    under_review: 0,
    closed: 0,
    assigned: 0,
    unassigned: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(q);
    setStatusInput(statusFilter);
    setCategoryInput(categoryFilter);
  }, [q, statusFilter, categoryFilter]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await listAdminSupportRequests({
          q: q || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
        });

        setRows(payload.results);
        setCount(payload.count);
        setSummary(payload.summary);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setSummary({
            total: 0,
            submitted: 0,
            under_review: 0,
            closed: 0,
            assigned: 0,
            unassigned: 0,
          });
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [categoryFilter, q, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const columns = useMemo(
    () => [
      {
        key: "id",
        title: "Request",
        render: (row: AdminSupportRequest) => (
          <div>
            <div className="font-medium text-foreground">#{row.id}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {formatDateTime(row.created_at)}
            </div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        render: (row: AdminSupportRequest) => (
          <div>
            <div className="font-medium text-foreground">
              {row.customer_name || "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.customer_phone || "—"}
            </div>
          </div>
        ),
      },
      {
        key: "category",
        title: "Category",
      },
      {
        key: "message",
        title: "Issue",
        render: (row: AdminSupportRequest) => (
          <div className="max-w-xl">
            <div className="line-clamp-2 text-sm text-foreground">{row.message}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.payment_reference_no
                ? `Ref ${row.payment_reference_no}`
                : row.payment
                  ? `Payment #${row.payment}`
                  : "No payment attached"}
              {" · "}
              {row.subscription_number ||
                (row.subscription ? `SUB-${row.subscription}` : "No subscription")}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Status",
        render: (row: AdminSupportRequest) => (
          <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
            {row.status}
          </span>
        ),
      },
      {
        key: "assigned_to_full_name",
        title: "Owner",
        render: (row: AdminSupportRequest) =>
          row.assigned_to_full_name ||
          row.assigned_to_username ||
          "Unassigned",
      },
      {
        key: "payment_amount",
        title: "Payment",
        align: "right" as const,
        render: (row: AdminSupportRequest) =>
          row.payment_amount ? money(row.payment_amount) : "—",
      },
    ],
    []
  );

  function applyFilters() {
    const next = new URLSearchParams();

    if (searchInput.trim()) next.set("q", searchInput.trim());
    if (statusInput.trim()) next.set("status", statusInput.trim());
    if (categoryInput.trim()) next.set("category", categoryInput.trim());

    const query = next.toString();
    router.replace(query ? `/admin/support-requests?${query}` : "/admin/support-requests");
  }

  function clearFilters() {
    setSearchInput("");
    setStatusInput("");
    setCategoryInput("");
    router.replace("/admin/support-requests");
  }

  return (
    <PortalPage
      title="Support Requests"
      subtitle="Customer-submitted support and dispute intake with receipt and subscription context."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Support Requests" },
      ]}
      actions={[
        {
          href: "/admin/customers",
          label: "Customers",
          variant: "secondary",
        },
        {
          href: "/admin/payments",
          label: "Payments",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Visible", value: String(count) },
        { label: "Submitted", value: String(summary.submitted), tone: "warning" },
        { label: "Under Review", value: String(summary.under_review) },
        { label: "Closed", value: String(summary.closed) },
        { label: "Assigned", value: String(summary.assigned) },
      ]}
      statusBadge={{ label: "Customer Support Intake", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
            <div>
              <label
                htmlFor="support-request-search"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Search
              </label>
              <input
                id="support-request-search"
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Customer, phone, payment ref, request id"
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              />
            </div>

            <div>
              <label
                htmlFor="support-request-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="support-request-status"
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(
                    normalizeStatusFilter(event.target.value.trim().toUpperCase())
                  )
                }
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="support-request-category"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Category
              </label>
              <select
                id="support-request-category"
                value={categoryInput}
                onChange={(event) => setCategoryInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All categories</option>
                <option value="PAYMENT_ISSUE">Payment issue</option>
                <option value="RECEIPT_ISSUE">Receipt issue</option>
                <option value="EMI_ISSUE">EMI issue</option>
                <option value="SUBSCRIPTION_QUERY">Subscription query</option>
                <option value="DRAW_QUERY">Lucky draw query</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={applyFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => void loadPage("refresh")}
                disabled={loading || refreshing}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </section>

        {loading ? <LoadingBlock label="Loading support requests..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load support requests"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No support requests"
            description="No customer-submitted support issues matched the current filters."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <DataTable<AdminSupportRequest>
            rows={rows}
            columns={columns}
            rowActions={(row) => (
              <div className="flex gap-2">
                <Link
                  href={`/admin/support-requests/${row.id}${currentQuery ? `?${currentQuery}` : ""}`}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  View Detail
                </Link>
                {typeof row.customer === "number" ? (
                  <Link
                    href={`/admin/customers/${row.customer}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Customer
                  </Link>
                ) : null}
                {typeof row.subscription === "number" ? (
                  <Link
                    href={`/admin/subscriptions/${row.subscription}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Subscription
                  </Link>
                ) : null}
                {typeof row.payment === "number" ? (
                  <Link
                    href={`/admin/payments/${row.payment}`}
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    Payment
                  </Link>
                ) : null}
              </div>
            )}
          />
        ) : null}
      </div>
    </PortalPage>
  );
}
