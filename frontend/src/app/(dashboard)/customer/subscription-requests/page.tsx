"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PaginationControls from "@/components/ui/PaginationControls";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import TableToolbar from "@/components/ui/TableToolbar";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
import SubscriptionRequestCard from "@/domains/subscription-requests/components/SubscriptionRequestCard";
import {
  listSubscriptionRequests,
  type SubscriptionRequestRecord,
} from "@/services/subscription-requests";

const PAGE_SIZE = 25;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load subscription requests.";
}

type RequestStatusFilter =
  | ""
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export default function CustomerSubscriptionRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFilter = ((searchParams.get("status") || "").trim().toUpperCase() ||
    "") as RequestStatusFilter;
  const currentPage = Math.max(Number(searchParams.get("page") || 1), 1);

  const [rows, setRows] = useState<SubscriptionRequestRecord[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(currentPage);
  const [numPages, setNumPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [statusInput, setStatusInput] = useState<RequestStatusFilter>(statusFilter);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatusInput(statusFilter);
    setPage(currentPage);
  }, [statusFilter, currentPage]);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await listSubscriptionRequests("customer", {
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
    [currentPage, statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const summary = useMemo(() => {
    return {
      submitted: rows.filter((row) => row.status === "SUBMITTED").length,
      approved: rows.filter((row) => row.status === "APPROVED").length,
      rejected: rows.filter((row) => row.status === "REJECTED").length,
    };
  }, [rows]);

  function applyFilter(nextStatus: RequestStatusFilter) {
    const next = new URLSearchParams();
    if (nextStatus) next.set("status", nextStatus);
    router.replace(
      next.toString()
        ? `/customer/subscription-requests?${next.toString()}`
        : "/customer/subscription-requests"
    );
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    router.replace(
      next.toString()
        ? `/customer/subscription-requests?${next.toString()}`
        : "/customer/subscription-requests"
    );
  }

  return (
    <PortalPage
      eyebrow="Customer Intake"
      title="Subscription Requests"
      subtitle="Track customer-created intake requests that remain separate from real subscriptions until admin approval."
      helperNote="A submitted request is not a live contract. Approval creates the real subscription, EMI schedule, and related audit trail through the backend workflow."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Subscription Requests" },
      ]}
      actions={[
        {
          href: "/customer/subscription-requests/create",
          label: "New Request",
          variant: "primary",
        },
        {
          href: "/customer/subscriptions",
          label: "My Subscriptions",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Approval required", tone: "info" }}
      stats={[
        { label: "Requests", value: count },
        {
          label: "Page submitted",
          value: summary.submitted,
          tone: summary.submitted > 0 ? "warning" : "default",
        },
        {
          label: "Page approved",
          value: summary.approved,
          tone: summary.approved > 0 ? "success" : "default",
        },
        {
          label: "Page rejected",
          value: summary.rejected,
          tone: summary.rejected > 0 ? "danger" : "default",
        },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Request register controls"
          description="Filter request intake by current review status and refresh the register without leaving the customer workspace."
          action={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
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
                  Requests stay operationally separate from live subscriptions. Use this register to follow review status, then open approved subscriptions from the detail view when available.
                </div>
              )
            }
          >
            <div className="grid gap-4 lg:grid-cols-[220px_auto]">
              <select
                value={statusInput}
                onChange={(event) =>
                  setStatusInput(event.target.value as RequestStatusFilter)
                }
                className="h-11 rounded-xl border border-border bg-background px-4 text-sm"
              >
                <option value="">All statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <div className="flex flex-wrap gap-2">
                <ActionButton type="button" onClick={() => applyFilter(statusInput)}>
                  Apply
                </ActionButton>
                <ActionButton
                  type="button"
                  variant="outline"
                  onClick={() => applyFilter("")}
                >
                  Clear
                </ActionButton>
              </div>
            </div>
          </TableToolbar>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading subscription requests..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscription requests"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <WorkspaceSection
            title="Customer request register"
            description="Submitted requests and their latest approval posture, without collapsing them into active subscription truth."
          >
            {rows.length === 0 ? (
              <EmptyState
                title="No subscription requests yet"
                description="Create a request when you want admin to review and activate a new subscription."
                action={
                  <ActionButton
                    href="/customer/subscription-requests/create"
                    variant="outline"
                  >
                    Create request
                  </ActionButton>
                }
              />
            ) : (
              <div className="space-y-4">
                {rows.map((request) => (
                  <SubscriptionRequestCard
                    key={request.id}
                    request={request}
                    href={`/customer/subscription-requests/${request.id}`}
                  />
                ))}
              </div>
            )}

            {rows.length > 0 ? (
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
              <WorkspaceNotice tone="info" title="Why this register stays separate">
                Subscription requests are intake records only. Approval or rejection remains auditable here, while actual subscription payment and EMI truth stay on the live subscription routes.
              </WorkspaceNotice>
            </div>
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
