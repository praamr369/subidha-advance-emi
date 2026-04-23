"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";

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

type RequestStatusFilter = "" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner subscription requests.";
}

export default function PartnerSubscriptionRequestsPage() {
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
        const payload = await listSubscriptionRequests("partner", {
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
      cancelled: rows.filter((row) => row.status === "CANCELLED").length,
    };
  }, [rows]);

  function applyFilter(nextStatus: RequestStatusFilter) {
    const next = new URLSearchParams();
    if (nextStatus) next.set("status", nextStatus);
    router.replace(
      next.toString()
        ? `/partner/subscription-requests?${next.toString()}`
        : "/partner/subscription-requests"
    );
  }

  function replacePage(targetPage: number) {
    const next = new URLSearchParams();
    if (statusFilter) next.set("status", statusFilter);
    if (targetPage > 1) next.set("page", String(targetPage));
    router.replace(
      next.toString()
        ? `/partner/subscription-requests?${next.toString()}`
        : "/partner/subscription-requests"
    );
  }

  return (
    <PortalPage
      eyebrow="Partner Intake"
      title="Partner Subscription Requests"
      subtitle="Submit and track partner-led EMI subscription intake without creating an active contract before admin approval."
      helperNote="Partner requests remain intake records until admin approval creates the real subscription. This workspace does not expose approval shortcuts or contract-state overrides."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscription Requests" },
      ]}
      actions={[
        {
          href: "/partner/subscription-requests/create",
          label: "New Request",
          variant: "primary",
        },
        {
          href: "/partner/subscriptions",
          label: "Partner Subscriptions",
          variant: "secondary",
        },
      ]}
      statusBadge={{ label: "Partner intake queue", tone: "info" }}
      stats={[
        { label: "Requests", value: count },
        { label: "Page Submitted", value: summary.submitted, tone: "warning" },
        { label: "Page Approved", value: summary.approved, tone: "success" },
        { label: "Page Cancelled", value: summary.cancelled, tone: summary.cancelled > 0 ? "danger" : undefined },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Partner request register"
          description="Track submitted partner requests, filter by review posture, and keep intake workflow separate from active subscription truth."
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
                  Existing partner-visible customers and new-customer snapshots both stay in review until admin approval activates the real subscription.
                </div>
              )
            }
          >
            <div className="grid gap-4 lg:grid-cols-[220px_auto]">
              <select
                value={statusInput}
                onChange={(event) => setStatusInput(event.target.value as RequestStatusFilter)}
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

        {loading ? <LoadingBlock label="Loading partner subscription requests..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner subscription requests"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No partner subscription requests yet"
            description="Create a request for a partner-visible customer or submit a new customer snapshot for admin approval."
            action={
              <ActionButton
                href="/partner/subscription-requests/create"
                variant="outline"
              >
                Create Request
              </ActionButton>
            }
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <WorkspaceSection
            title="Partner request directory"
            description="Open a request to review approval posture, customer snapshot details, and any approved subscription linkage."
          >
            <div className="space-y-4">
              {rows.map((request) => (
                <SubscriptionRequestCard
                  key={request.id}
                  request={request}
                  href={`/partner/subscription-requests/${request.id}`}
                  showRequester
                />
              ))}

              <WorkspaceNotice tone="info" title="Request-state boundary">
                Request rows show intake review posture only. They do not create live subscriptions, post payments, or bypass admin approval workflow.
              </WorkspaceNotice>

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
          </WorkspaceSection>
        ) : null}
      </div>
    </PortalPage>
  );
}
