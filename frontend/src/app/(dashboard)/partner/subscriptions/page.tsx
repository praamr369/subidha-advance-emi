"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { RefreshCw, Search } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PaginationControls from "@/components/ui/PaginationControls";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
import { formatPlanTypeLabel } from "@/lib/plan-labels";
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
  return `₹${numeric.toFixed(2)}`;
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

function statusToken(value?: string): string {
  return String(value || "").trim().toUpperCase();
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
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

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
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
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
    router.replace(
      queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions"
    );
  }

  function clearFilters() {
    setSearchInput("");
    setStatusInput("");
    const next = new URLSearchParams();
    if (customerFilter) next.set("customer", customerFilter);
    const queryString = next.toString();
    router.replace(
      queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions"
    );
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (initialStatus) next.set("status", initialStatus);
    if (customerFilter) next.set("customer", customerFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    const queryString = next.toString();
    router.replace(
      queryString ? `/partner/subscriptions?${queryString}` : "/partner/subscriptions"
    );
  }

  const summary = useMemo(() => {
    const pageActive = rows.filter((row) => statusToken(row.status) === "ACTIVE").length;
    const pageCompleted = rows.filter((row) => statusToken(row.status) === "COMPLETED").length;
    const pageWon = rows.filter((row) => statusToken(row.status) === "WON").length;
    const pageOutstanding = rows.reduce((sum, row) => sum + getOutstandingAmount(row), 0);
    return { pageActive, pageCompleted, pageWon, pageOutstanding };
  }, [rows]);

  const columns = useMemo<Column<PartnerSubscription>[]>(
    () => [
      {
        key: "subscription_number",
        title: "Subscription",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">
              {row.subscription_number || `SUB-${row.id}`}
            </div>
            <div className="text-xs text-muted-foreground">
              Lucky #{row.lucky_number ?? "—"} · {formatPlanTypeLabel(row.plan_type)}
            </div>
          </div>
        ),
      },
      {
        key: "customer_name",
        title: "Customer",
        sortable: true,
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.customer_name || "—"}</div>
            <div className="text-xs text-muted-foreground">{row.customer_phone || "—"}</div>
          </div>
        ),
      },
      {
        key: "product_name",
        title: "Product / Batch",
        render: (row) => (
          <div className="space-y-2">
            <div className="text-sm text-foreground">{row.product_name || "—"}</div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge
                status={row.batch_status || "OPEN"}
                label={row.batch_code || "No batch"}
              />
            </div>
          </div>
        ),
      },
      {
        key: "status",
        title: "Contract State",
        sortable: true,
        render: (row) => (
          <div className="space-y-2">
            <StatusBadge status={row.status || "PENDING"} />
            {getOutstandingAmount(row) > 0 ? (
              <StatusBadge status="PENDING" label={`Outstanding ${formatMoney(getOutstandingAmount(row))}`} />
            ) : (
              <StatusBadge status="PAID" label="No Outstanding" />
            )}
          </div>
        ),
      },
      {
        key: "monthly_amount",
        title: "Financial",
        align: "right",
        render: (row) => (
          <div className="space-y-1 text-right">
            <div className="font-semibold text-foreground">
              {formatMoney(row.monthly_amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total {formatMoney(row.total_amount)}
            </div>
            <div className="text-xs text-muted-foreground">
              {row.pending_emi_count ?? 0} pending EMI
            </div>
          </div>
        ),
      },
      {
        key: "next_due_date",
        title: "Timing",
        sortable: true,
        sortAccessor: (row) => Date.parse(row.next_due_date || row.start_date || "") || 0,
        render: (row) => (
          <div className="space-y-1">
            <div className="text-sm text-foreground">Start {formatDate(row.start_date)}</div>
            <div className="text-xs text-muted-foreground">
              Next due {formatDate(row.next_due_date)}
            </div>
            <div className="text-xs text-muted-foreground">
              Last payment {formatDate(row.last_payment_date)}
            </div>
          </div>
        ),
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Partner Contracts"
      title="Partner Subscriptions"
      subtitle="Review only the subscriptions attributed to your partner scope, with clearer contract state, outstanding amount, and next action visibility."
      helperNote="This register is partner-scoped visibility only. Admin-only lifecycle controls, finance settlement, and payout authorization stay outside this workspace."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscriptions" },
      ]}
      actions={[
        {
          href: "/partner/subscription-requests",
          label: "Subscription Requests",
          variant: "primary",
        },
        {
          href: "/partner/customers",
          label: "Customers",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Collections",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Matching", value: count },
        { label: "Page Active", value: summary.pageActive, tone: "success" },
        {
          label: "Page Completed",
          value: summary.pageCompleted,
          tone: summary.pageCompleted > 0 ? "default" : undefined,
        },
        { label: "Page Outstanding", value: formatMoney(summary.pageOutstanding), tone: "warning" },
      ]}
      statusBadge={{ label: "Partner contract scope", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Subscription workflow"
          description="Filter by contract status, search within the current partner scope, and jump directly into detail or collection actions."
          action={
            <ActionButton
              type="button"
              variant="outline"
              onClick={() => void loadSubscriptions("refresh")}
              disabled={refreshing || loading}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <TableToolbar
            footer={
              q || initialStatus || customerFilter ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-[0.14em]">Active filters</span>
                  {q ? <StatusBadge status="OPEN" label={`Search: ${q}`} hideIcon /> : null}
                  {initialStatus ? <StatusBadge status={initialStatus} hideIcon /> : null}
                  {customerFilter ? (
                    <StatusBadge status="ASSIGNED" label={`Customer scope: ${customerFilter}`} hideIcon />
                  ) : null}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  This screen stays partner-scoped and excludes admin-only financial controls. It improves follow-up visibility only.
                </div>
              )
            }
          >
            <form
              onSubmit={handleApplyFilters}
              className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
            >
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search customer, phone, product, batch, lucky no."
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-4 text-sm outline-none transition focus:border-ring"
                />
              </label>

              <select
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value as FilterStatus)}
                className="h-10 rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All states</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="WON">Won</option>
                <option value="DEFAULTED">Defaulted</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <ActionButton type="submit">
                  Apply
                </ActionButton>
                <ActionButton type="button" variant="outline" onClick={clearFilters}>
                  Reset
                </ActionButton>
                {customerFilter ? (
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => router.replace("/partner/subscriptions")}
                  >
                    Clear Scope
                  </ActionButton>
                ) : null}
              </div>
            </form>
          </TableToolbar>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading subscriptions..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Failed to load subscriptions"
            description={error}
            onRetry={() => void loadSubscriptions("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <WorkspaceSection
            title="Subscription rows"
            description="Open the partner subscription detail page for EMI schedule and payment progress, or jump directly into collection workflow."
          >
            {count === 0 ? (
              <EmptyState
                title="No subscriptions found"
                description="No subscriptions matched the current partner scope and filter set."
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No rows on this page"
                description="The current page has no results. Move to a previous page or change the filters."
              />
            ) : (
              <DataTable<PartnerSubscription>
                rows={rows}
                columns={columns}
                pageSize={PAGE_SIZE}
                onRowClick={(row) => router.push(`/partner/subscriptions/${row.id}`)}
                rowActions={(row) => (
                  <div className="flex flex-wrap gap-2">
                    <ActionButton
                      href={`/partner/subscriptions/${row.id}`}
                      variant="outline"
                      size="sm"
                    >
                      View Detail
                    </ActionButton>
                    {row.customer ? (
                      <ActionButton
                        href={`/partner/customers/${row.customer}`}
                        variant="ghost"
                        size="sm"
                      >
                        Customer
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      href={`/partner/collections/create?subscription=${row.id}`}
                      variant="ghost"
                      size="sm"
                    >
                      Collect
                    </ActionButton>
                  </div>
                )}
              />
            )}

            <div className="mt-5">
              <WorkspaceNotice tone="info" title="Contract follow-up boundary">
                This register is for partner contract visibility and next-step routing only. Payment posting still flows through collection requests, while reconciliation and payout controls remain protected in separate finance workflows.
              </WorkspaceNotice>
            </div>

            {count > 0 ? (
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
            ) : null}
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
