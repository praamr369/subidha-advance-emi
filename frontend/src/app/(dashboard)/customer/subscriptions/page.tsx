"use client";

import { RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PublicProductMedia from "@/components/public/PublicProductMedia";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PaginationControls from "@/components/ui/PaginationControls";
import PortalPage from "@/components/ui/PortalPage";
import { SelfServicePageShell } from "@/components/layout/page-shells";
import StatusBadge from "@/components/ui/status-badge";
import { DataTableShell, DetailPanel, MobileSafeTable } from "@/components/ui/operations";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import {
  listCustomerSubscriptionsRegister,
  type CustomerSubscriptionRegisterResponse,
} from "@/services/customer/paginated-subscriptions";
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

  const columns = useMemo<Column<CustomerSubscription>[]>(
    () => [
      {
        key: "subscription_number",
        title: "Subscription",
        render: (row) => (
          <div className="flex items-start gap-3">
            <div className="w-20 shrink-0">
              <PublicProductMedia
                src={row.product_image}
                alt={row.product_name || "Subscription product"}
                sizes="80px"
                className="h-16 w-full rounded-2xl"
                fallbackLabel="Media pending"
                badge={row.product_code || "Product"}
              />
            </div>
            <div className="min-w-0">
              <div className="font-medium text-foreground">
                {row.subscription_number || `SUB-${row.id}`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {row.product_name || "Lucky Plan"} · Batch {row.batch_code || "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Lucky #{row.lucky_number ?? "—"}
              </div>
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => <StatusBadge status={row.status || "ACTIVE"} />,
      },
      {
        key: "winner_waiver",
        title: "Winner / Waiver",
        render: (row) => (
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
        render: (row) => (
          <div>
            <div className="font-medium text-foreground">
              {paymentProgressLabel(row)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Paid {money(row.total_paid_amount ?? row.financial_summary?.paid_amount)} · Next due{" "}
              {formatDate(row.next_due_date)}
            </div>
          </div>
        ),
      },
      {
        key: "monthly_amount",
        title: "Monthly",
        align: "right",
        render: (row) => money(row.monthly_amount),
      },
      {
        key: "total_amount",
        title: "Total",
        align: "right",
        render: (row) => money(row.total_amount),
      },
      {
        key: "start_date",
        title: "Start",
        render: (row) => formatDate(row.start_date),
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
      eyebrow="Customer Subscriptions"
      title="My Subscriptions"
      subtitle="Customer-scoped subscription truth with contract status, winner benefit visibility, and payment progress in one operational register."
      helperNote="Winner benefit, waiver impact, and contract settlement stay visible together here, but payment proof remains on the customer payment routes."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Subscriptions" },
      ]}
      actions={[
        {
          href: "/customer/subscription-requests",
          label: "Subscription Requests",
          variant: "primary",
        },
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
        { label: "Matching subscriptions", value: count },
        { label: "Page active", value: pageActiveCount, tone: "success" },
        {
          label: "Page winner benefit",
          value: pageWinnerCount,
          tone: pageWinnerCount > 0 ? "info" : "default",
        },
        {
          label: "Page outstanding",
          value: money(pageOutstanding),
          tone: pageOutstanding > 0 ? "warning" : "success",
        },
        { label: "Page next due", value: pageNextDueLabel },
      ]}
      statusBadge={{ label: "Customer subscription truth", tone: "info" }}
    >
      <SelfServicePageShell>
        <DetailPanel
          title="Subscription filters"
          description="Narrow the register by current contract status and refresh the latest subscription truth."
        >
          <div className="mb-4 flex justify-end">
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          </div>
          <TableToolbar
            footer={
              statusFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">
                    Active filter
                  </span>
                  <StatusBadge status={statusFilter} hideIcon />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Open a subscription to view full EMI detail, waiver posture, delivery status, and direct payment-history navigation for that contract.
                </div>
              )
            }
          >
            <div className="grid gap-4 lg:grid-cols-[220px_auto]">
              <select
                id="customer-subscription-status"
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="WON">Won</option>
                <option value="DEFAULTED">Defaulted</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" onClick={applyFilters}>
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={clearFilters}>
                  Clear
                </ActionButton>
              </div>
            </div>
          </TableToolbar>
        </DetailPanel>

        {loading ? <LoadingBlock label="Loading subscriptions..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscriptions"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <DetailPanel
            title="Customer subscription register"
            description="Dedicated customer subscription rows with safe navigation into detail and payment history."
          >
            {count === 0 ? (
              <EmptyState
                title="No subscriptions found"
                description={
                  statusFilter
                    ? `No customer subscriptions matched the current ${statusFilter} filter.`
                    : "No customer subscription records are currently available."
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No rows on this page"
                description="The current page has no results. Move to a previous page or change the filters."
              />
            ) : (
              <DataTableShell>
                <MobileSafeTable className="border-none bg-transparent">
                  <DataTable<CustomerSubscription>
                    rows={rows}
                    columns={columns}
                    onRowClick={(row) => router.push(`/customer/subscriptions/${row.id}`)}
                    rowActions={(row) => (
                      <div className="flex flex-wrap justify-end gap-2">
                        <ActionButton
                          href={`/customer/subscriptions/${row.id}`}
                          variant="outline"
                          className="min-h-11"
                        >
                          View
                        </ActionButton>
                        <ActionButton
                          href={`/customer/payments?subscription=${row.id}`}
                          variant="outline"
                          className="min-h-11"
                        >
                          Payments
                        </ActionButton>
                      </div>
                    )}
                  />
                </MobileSafeTable>
              </DataTableShell>
            )}

            {count > 0 ? (
              <div className="mt-5">
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

            <div className="mt-5">
              <WorkspaceNotice tone="info" title="Winner and waiver visibility">
                Winner and waiver posture on this page comes from customer-scoped subscription truth. EMI-row detail and exact settlement context remain on the subscription detail page.
              </WorkspaceNotice>
            </div>
          </DetailPanel>
        ) : null}
      </SelfServicePageShell>
    </PortalPage>
  );
}
