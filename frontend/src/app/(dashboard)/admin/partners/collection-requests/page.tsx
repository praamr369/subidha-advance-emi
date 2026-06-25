"use client";
import { formatRupee } from "@/lib/utils/currency";

import { useCallback, useEffect, useMemo, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import DataTable from "@/components/ui/DataTable";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import { apiFetch } from "@/lib/api";

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
};

type PartnerCollectionRequestListResponse = {
  count: number;
  results: PartnerCollectionRequestRow[];
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
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "UNDER_REVIEW":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "SUBMITTED":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700";
    case "CANCELLED":
      return "border-slate-200 bg-slate-100 text-muted-foreground";
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

export default function AdminPartnerCollectionRequestsPage() {
  const [rows, setRows] = useState<PartnerCollectionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
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
  }, [statusFilter]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const submittedCount = useMemo(
    () => rows.filter((row) => row.status === "SUBMITTED").length,
    [rows]
  );

  const underReviewCount = useMemo(
    () => rows.filter((row) => row.status === "UNDER_REVIEW").length,
    [rows]
  );

  const approvedCount = useMemo(
    () => rows.filter((row) => row.status === "APPROVED").length,
    [rows]
  );

  const rejectedCount = useMemo(
    () => rows.filter((row) => row.status === "REJECTED").length,
    [rows]
  );

  async function handleApprove(row: PartnerCollectionRequestRow) {
    const note = window.prompt(
      `Approve request #${row.id}. Optional approval note:`,
      ""
    );
    if (note === null) return;

    setProcessingId(row.id);
    setError(null);

    try {
      await approveAdminPartnerCollectionRequest(row.id, note || undefined);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(row: PartnerCollectionRequestRow) {
    const reason = window.prompt(
      `Reject request #${row.id}. Rejection reason:`,
      ""
    );
    if (reason === null) return;

    setProcessingId(row.id);
    setError(null);

    try {
      await rejectAdminPartnerCollectionRequest(row.id, reason || undefined);
      await loadPage("refresh");
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <ERPPageShell
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
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? <LoadingBlock label="Loading partner collection requests..." /> : null}

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
                <div className="space-y-1">
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
                <div className="space-y-1">
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
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(
                    row.status
                  )}`}
                >
                  {prettyStatus(row.status)}
                </span>
              ),
            },
            {
              key: "actions",
              title: "Actions",
              render: (row) => {
                const disabled =
                  processingId === row.id ||
                  row.status === "APPROVED" ||
                  row.status === "REJECTED" ||
                  row.status === "CANCELLED";

                return (
                  <div className="flex flex-col items-start gap-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void handleApprove(row)}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processingId === row.id ? "Processing..." : "Approve"}
                    </button>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void handleReject(row)}
                      className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                );
              },
            },
          ]}
        />
      ) : null}
    </ERPPageShell>
  );
}