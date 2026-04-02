"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DataTable from "@/components/ui/DataTable";
import PaginationControls from "@/components/ui/PaginationControls";
import PortalPage from "@/components/ui/PortalPage";
import { listCustomerSubscriptionsRegister, type CustomerSubscriptionRegisterResponse } from "@/services/customer/paginated-subscriptions";
import type { CustomerSubscription } from "@/services/customer";

const PAGE_SIZE = 25;

function money(value?: string | number | null): string {
  return `₹${Number(value ?? 0).toFixed(2)}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;

  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Failed to load customer subscriptions.";
}

function statusBadgeClass(status?: string): string {
  switch ((status || "").toUpperCase()) {
    case "ACTIVE":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "COMPLETED":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "WON":
      return "border-violet-200 bg-violet-50 text-violet-700";
    case "DEFAULTED":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function winnerWaiverLabel(subscription: CustomerSubscription): string {
  const winnerRecorded =
    (subscription.status || "").toUpperCase() === "WON" ||
    (subscription.winner_month !== null &&
      subscription.winner_month !== undefined);

  const waivedAmount =
    subscription.financial_summary?.waived_amount ?? subscription.waived_amount;
  const waivedCount = subscription.waived_emi_count ?? 0;
  const hasWaiver =
    Number(waivedAmount ?? 0) > 0 || Number(waivedCount) > 0;

  if (winnerRecorded && hasWaiver) {
    return `Winner month ${subscription.winner_month ?? "—"} · Waived ${money(
      waivedAmount
    )}`;
  }

  if (winnerRecorded) {
    return `Winner month ${subscription.winner_month ?? "—"}`;
  }

  if (hasWaiver) {
    return `Waived ${money(waivedAmount)}${waivedCount > 0 ? ` · ${waivedCount} EMI` : ""}`;
  }

  return "No winner or waiver recorded";
}

function paymentProgressLabel(subscription: CustomerSubscription): string {
  const paidCount = subscription.paid_emi_count ?? 0;
  const emiCount = subscription.emi_count ?? 0;
  const outstanding =
    subscription.outstanding_amount ??
    subscription.financial_summary?.outstanding_amount;

  if (emiCount > 0) {
    return `${paidCount} of ${emiCount} EMI paid · ${money(outstanding)} outstanding`;
  }

  return `${money(
    subscription.total_paid_amount ?? subscription.financial_summary?.paid_amount
  )} paid · ${money(outstanding)} outstanding`;
}

export default function CustomerSubscriptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = (searchParams.get("status") || "").trim().toUpperCase();
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [statusInput, setStatusInput] = useState(statusFilter);
  const [rows, setRows] = useState<CustomerSubscription[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatusInput(statusFilter);
    setPage(currentPage);
  }, [statusFilter, currentPage]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload: CustomerSubscriptionRegisterResponse =
          await listCustomerSubscriptionsRegister({
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
        setError(toErrorMessage(err));
        if (mode === "initial") {
          setRows([]);
          setCount(0);
          setNumPages(0);
          setHasNext(false);
          setHasPrevious(false);
        }
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [currentPage, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const pageActiveCount = useMemo(
    () => rows.filter((row) => (row.status || "").toUpperCase() === "ACTIVE").length,
    [rows]
  );

  const pageWinnerCount = useMemo(
    () =>
      rows.filter(
        (row) =>
          (row.status || "").toUpperCase() === "WON" ||
          (row.winner_month !== null && row.winner_month !== undefined)
      ).length,
    [rows]
  );

  const pageOutstanding = useMemo(
    () =>
      rows.reduce(
        (sum, row) =>
          sum +
          Number(
            row.outstanding_amount ?? row.financial_summary?.outstanding_amount ?? 0
          ),
        0
      ),
    [rows]
  );

  const pageNextDueLabel = useMemo(() => {
    const nextDue = rows
      .map((row) => row.next_due_date)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(left) - Date.parse(right))[0];

    return nextDue ? formatDate(nextDue) : "—";
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row: CustomerSubscription) => (
          <div>
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.id}`}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.product_name || row.plan_type || "Lucky Plan"}
              {row.batch_code ? ` · ${row.batch_code}` : ""}
              {typeof row.lucky_number === "number" ? ` · Lucky #${row.lucky_number}` : ""}
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Status",
        render: (row: CustomerSubscription) => (
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
              row.status
            )}`}
          >
            {row.status || "—"}
          </span>
        ),
      },
      {
        key: "winner_waiver",
        title: "Winner / Waiver",
        render: (row: CustomerSubscription) => (
          <div>
            <div className="font-medium text-foreground">
              {winnerWaiverLabel(row)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Waived EMI count {row.waived_emi_count ?? 0}
            </div>
          </div>
        ),
      },
      {
        key: "progress",
        title: "Payment Progress",
        render: (row: CustomerSubscription) => (
          <div>
            <div className="font-medium text-foreground">
              {paymentProgressLabel(row)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Paid {money(row.total_paid_amount ?? row.financial_summary?.paid_amount)} ·
              Next due {formatDate(row.next_due_date)}
            </div>
          </div>
        ),
      },
      {
        key: "monthly_amount",
        title: "Monthly",
        align: "right" as const,
        render: (row: CustomerSubscription) => money(row.monthly_amount),
      },
      {
        key: "total_amount",
        title: "Total",
        align: "right" as const,
        render: (row: CustomerSubscription) => money(row.total_amount),
      },
      {
        key: "start_date",
        title: "Start",
        render: (row: CustomerSubscription) => formatDate(row.start_date),
      },
    ],
    []
  );

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    const query = next.toString();
    router.replace(
      query ? `/customer/subscriptions?${query}` : "/customer/subscriptions"
    );
  }

  function applyFilters() {
    const next = new URLSearchParams();
    if (statusInput) {
      next.set("status", statusInput);
    }
    const query = next.toString();
    router.replace(
      query ? `/customer/subscriptions?${query}` : "/customer/subscriptions"
    );
  }

  function clearFilters() {
    setStatusInput("");
    router.replace("/customer/subscriptions");
  }

  return (
    <PortalPage
      title="My Subscriptions"
      subtitle="Customer-scoped subscription truth backed by the dedicated subscriptions API."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Subscriptions" },
      ]}
      actions={[
        {
          href: "/customer/payments",
          label: "My Payments",
          variant: "secondary",
        },
        {
          href: "/customer/support",
          label: "Support",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Matching Subscriptions", value: count },
        { label: "Page Active", value: pageActiveCount },
        { label: "Page Winner Benefit", value: pageWinnerCount },
        {
          label: "Page Outstanding",
          value: money(pageOutstanding),
          tone: pageOutstanding > 0 ? "warning" : "success",
        },
        { label: "Page Next Due", value: pageNextDueLabel },
      ]}
      statusBadge={{ label: "Customer Subscription Truth", tone: "info" }}
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="w-full lg:w-72">
              <label
                htmlFor="customer-subscription-status"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Status
              </label>
              <select
                id="customer-subscription-status"
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="WON">Won</option>
                <option value="DEFAULTED">Defaulted</option>
              </select>
            </div>

            <div className="flex gap-2">
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

          {statusFilter && !loading ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Showing subscriptions filtered by status {statusFilter}.
            </div>
          ) : null}
        </section>

        {loading ? <LoadingBlock label="Loading subscriptions..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscriptions"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && count === 0 ? (
          <EmptyState
            title="No subscriptions found"
            description={
              statusFilter
                ? `No customer subscriptions matched the current ${statusFilter} filter.`
                : "No customer subscription records are currently available."
            }
          />
        ) : null}

        {!loading && !error && count > 0 ? (
          <>
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Subscription register
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This page uses the dedicated customer subscriptions API. Open
                  a subscription for full EMI detail or jump into payment
                  history for that contract.
                </p>
              </div>

              {rows.length > 0 ? (
                <DataTable<CustomerSubscription>
                  rows={rows}
                  columns={columns}
                  onRowClick={(row) =>
                    router.push(`/customer/subscriptions/${row.id}`)
                  }
                  rowActions={(row) => (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/customer/subscriptions/${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        View
                      </Link>
                      <Link
                        href={`/customer/payments?subscription=${row.id}`}
                        className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                      >
                        Payments
                      </Link>
                    </div>
                  )}
                />
              ) : (
                <EmptyState
                  title="No rows on this page"
                  description="The current page has no results. Move to a previous page or change the filters."
                />
              )}

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
            </section>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Winner and waiver visibility on this page comes from your
              customer-scoped subscription truth. EMI-row detail remains
              available on the subscription detail page.
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
