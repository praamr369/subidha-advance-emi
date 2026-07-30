"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useCallback, useEffect, useMemo, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import DataTable from "@/components/ui/DataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { apiFetch } from "@/lib/api";
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle, X } from "lucide-react";

type PartnerCollectionRequestListResponse = {
  count: number;
  results: PartnerCollectionRequestRow[];
};

type ActionPanel = {
  row: PartnerCollectionRequestRow;
  type: "approve" | "reject" | "flag" | "reopen";
  note: string;
};

type PartnerCollectionRequestRow = {
  id: number;
  partner_username?: string;
  subscription: number;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  amount: string;
  payment_method: string;
  payment_date: string;
  reference_no?: string | null;
  status: string;
  review_note?: string;
  reviewed_by_username?: string | null;
  reviewed_at?: string | null;
  approved_payment_id?: number | null;
  approved_emi_id?: number | null;
  created_at: string;
  is_flagged_bad?: boolean;
  flag_reason?: string | null;
  flagged_by_username?: string | null;
  flagged_at?: string | null;
};

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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusTone(status?: string): string {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
    case "UNDER_REVIEW":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300";
    case "SUBMITTED":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
    case "CANCELLED":
      return "border-border bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function prettyStatus(status?: string): string {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load partner collection requests.";
}

async function listAdminPartnerCollectionRequests(
  status?: string
): Promise<PartnerCollectionRequestListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<PartnerCollectionRequestListResponse>(
    `/admin/collection-requests/${query}`
  );
}

async function approveAdminPartnerCollectionRequest(
  id: number,
  note?: string
): Promise<void> {
  await apiFetch(`/admin/collection-requests/${id}/approve/`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

async function rejectAdminPartnerCollectionRequest(
  id: number,
  reason?: string
): Promise<void> {
  await apiFetch(`/admin/collection-requests/${id}/reject/`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

async function flagAdminPartnerCollectionRequest(
  id: number,
  flag_reason?: string
): Promise<void> {
  await apiFetch(`/admin/collection-requests/${id}/flag/`, {
    method: "POST",
    body: JSON.stringify({ flag_reason }),
  });
}

async function reopenAdminPartnerCollectionRequest(
  id: number,
  note?: string
): Promise<void> {
  await apiFetch(`/admin/collection-requests/${id}/reopen/`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export default function AdminPartnerCollectionRequestsPage() {
  const [rows, setRows] = useState<PartnerCollectionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionPanel, setActionPanel] = useState<ActionPanel | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await listAdminPartnerCollectionRequests(
          statusFilter || undefined
        );
        setRows(Array.isArray(payload.results) ? payload.results : []);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setRows([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const submittedCount = useMemo(
    () => rows.filter((r) => r.status === "SUBMITTED").length,
    [rows]
  );
  const underReviewCount = useMemo(
    () => rows.filter((r) => r.status === "UNDER_REVIEW").length,
    [rows]
  );
  const approvedCount = useMemo(
    () => rows.filter((r) => r.status === "APPROVED").length,
    [rows]
  );
  const rejectedCount = useMemo(
    () => rows.filter((r) => r.status === "REJECTED").length,
    [rows]
  );

  const openPanel = useCallback(
    (row: PartnerCollectionRequestRow, type: "approve" | "reject" | "flag" | "reopen") => {
      setActionPanel({ row, type, note: "" });
      setActionError(null);
    },
    []
  );

  const closePanel = useCallback(() => {
    setActionPanel(null);
    setActionError(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!actionPanel) return;
    setProcessingId(actionPanel.row.id);
    setActionError(null);
    try {
      if (actionPanel.type === "approve") {
        await approveAdminPartnerCollectionRequest(actionPanel.row.id, actionPanel.note || undefined);
      } else if (actionPanel.type === "reject") {
        await rejectAdminPartnerCollectionRequest(actionPanel.row.id, actionPanel.note || undefined);
      } else if (actionPanel.type === "flag") {
        await flagAdminPartnerCollectionRequest(actionPanel.row.id, actionPanel.note || undefined);
      } else if (actionPanel.type === "reopen") {
        await reopenAdminPartnerCollectionRequest(actionPanel.row.id, actionPanel.note || undefined);
      }
      closePanel();
      await loadPage("refresh");
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }, [actionPanel, closePanel, loadPage]);

  const isApproveAction = actionPanel?.type === "approve";
  const isFlagAction = actionPanel?.type === "flag";
  const isReopenAction = actionPanel?.type === "reopen";

  return (
    <ERPPageShell
      eyebrow="Partners"
      title="Partner Collection Requests"
      subtitle="Controlled approval queue for partner-submitted field collection reports. Approve or reject request status only."
      helperNote="This is a controlled approval queue. Approving or rejecting a request updates the request status through the existing backend workflow. No direct payment, commission, or payout record is created from this page."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Partners", href: "/admin/partners" },
        { label: "Collection Requests" },
      ]}
      stats={[
        { label: "Submitted", value: submittedCount },
        { label: "Under Review", value: underReviewCount },
        { label: "Approved", value: approvedCount },
        { label: "Rejected", value: rejectedCount },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading ? (
        <LoadingBlock label="Loading partner collection requests..." />
      ) : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner collection requests"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          title="No partner collection requests"
          description="There are no partner collection requests for the current filter."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <DataTable<PartnerCollectionRequestRow>
          rows={rows}
          emptyText="No partner collection requests."
          columns={[
            {
              key: "request",
              title: "Request",
              render: (row) => (
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">#{row.id}</div>
                  <div className="text-xs text-muted-foreground">
                    {row.partner_username || "Partner"}
                  </div>
                </div>
              ),
            },
            {
              key: "subscription_number",
              title: "Subscription",
              render: (row) => (
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">
                    {row.subscription_number || `SUB-${row.subscription}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {row.customer_name || "Unknown customer"}
                  </div>
                </div>
              ),
            },
            {
              key: "amount",
              title: "Amount",
              align: "right",
              render: (row) => formatRupee(row.amount),
            },
            {
              key: "payment_method",
              title: "Method",
            },
            {
              key: "payment_date",
              title: "Collection Date",
              render: (row) => formatDate(row.payment_date),
            },
            {
              key: "created_at",
              title: "Submitted At",
              render: (row) => formatDateTime(row.created_at),
            },
            {
              key: "status",
              title: "Status",
              render: (row) => (
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(row.status)}`}
                >
                  {prettyStatus(row.status)}
                </span>
              ),
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => {
                const isApproved = row.status === "APPROVED";
                const isTerminal = isApproved || row.status === "CANCELLED";
                const isRejectedOrFlagged =
                  row.status === "REJECTED";
                const isFlagged = row.is_flagged_bad;

                if (isApproved) {
                  return (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="size-3.5" />
                      Approved
                    </span>
                  );
                }

                if (isTerminal) {
                  return (
                    <span className="text-xs text-muted-foreground">
                      {prettyStatus(row.status)}
                    </span>
                  );
                }

                if (isRejectedOrFlagged) {
                  return (
                    <div className="flex flex-col gap-1.5">
                      {isFlagged ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                          <AlertTriangle className="size-2.5" />
                          Bad request flag
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={processingId === row.id}
                        onClick={() => openPanel(row, "reopen")}
                        className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                      >
                        <RefreshCw className="size-3.5" />
                        Re-open &amp; Approve
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={processingId === row.id}
                      onClick={() => openPanel(row, "approve")}
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      <CheckCircle2 className="size-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={processingId === row.id}
                      onClick={() => openPanel(row, "flag")}
                      className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 shadow-sm transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                    >
                      <AlertTriangle className="size-3.5" />
                      Flag bad
                    </button>
                    <button
                      type="button"
                      disabled={processingId === row.id}
                      onClick={() => openPanel(row, "reject")}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                    >
                      <XCircle className="size-3.5" />
                      Reject
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      ) : null}

      {/* Inline Action Panel */}
      {actionPanel ? (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background shadow-2xl">
          <div className="mx-auto max-w-2xl px-4 py-5">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  {isApproveAction ? (
                    <CheckCircle2 className="size-5 text-emerald-600" />
                  ) : isFlagAction ? (
                    <AlertTriangle className="size-5 text-orange-500" />
                  ) : isReopenAction ? (
                    <RefreshCw className="size-5 text-blue-500" />
                  ) : (
                    <XCircle className="size-5 text-red-500" />
                  )}
                  <span className="text-base font-semibold text-foreground">
                    {isApproveAction
                      ? "Approve"
                      : isFlagAction
                        ? "Flag as Bad Request"
                        : isReopenAction
                          ? "Re-open & Approve"
                          : "Reject"}{" "}
                    — #{actionPanel.row.id}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {actionPanel.row.partner_username || "Partner"} —{" "}
                  {actionPanel.row.subscription_number ||
                    `SUB-${actionPanel.row.subscription}`}{" "}
                  — {formatRupee(actionPanel.row.amount)} on{" "}
                  {formatDate(actionPanel.row.payment_date)}
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-3 flex flex-col gap-1.5">
              {isFlagAction ? (
                <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300">
                  <strong>Flag as Bad Request</strong> — marks this submission as money-not-received.
                  Visible to the partner and customer. You can re-open and approve later when money is confirmed.
                </div>
              ) : isReopenAction ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  <strong>Re-open</strong> — moves the request back to Under Review so it can be approved.
                  Use this when money has been subsequently confirmed or the rejection was a mistake.
                </div>
              ) : null}
              <label
                htmlFor="action-note"
                className="text-xs font-medium text-foreground"
              >
                {isApproveAction
                  ? "Approval note (optional)"
                  : isFlagAction
                    ? "Flag reason (shown to partner and customer)"
                    : isReopenAction
                      ? "Re-open note (optional)"
                      : "Rejection reason (optional)"}
              </label>
              <textarea
                id="action-note"
                rows={2}
                value={actionPanel.note}
                onChange={(e) =>
                  setActionPanel((prev) =>
                    prev ? { ...prev, note: e.target.value } : prev
                  )
                }
                placeholder={
                  isApproveAction
                    ? "e.g. Verified with bank statement"
                    : isFlagAction
                      ? "e.g. No cash received on this date — please resubmit with correct details"
                      : isReopenAction
                        ? "e.g. Payment confirmed via bank statement 2026-07-16"
                        : "e.g. Amount mismatch — please resubmit with correct receipt"
                }
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {actionError ? (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {actionError}
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={processingId !== null}
                className={`inline-flex h-10 items-center justify-center rounded-xl px-6 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isApproveAction || isReopenAction
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : isFlagAction
                      ? "bg-orange-600 text-white hover:bg-orange-700"
                      : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {processingId !== null
                  ? "Processing…"
                  : isApproveAction
                    ? "Confirm Approval"
                    : isFlagAction
                      ? "Confirm Flag"
                      : isReopenAction
                        ? "Re-open & Set Under Review"
                        : "Confirm Rejection"}
              </button>
              <button
                type="button"
                onClick={closePanel}
                disabled={processingId !== null}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-6 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ERPPageShell>
  );
}
