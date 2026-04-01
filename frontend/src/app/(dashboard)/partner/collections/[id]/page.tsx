"use client";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import DataTable from "@/components/ui/DataTable";
import {
  getPartnerCollectionRequestDetail,
  type PartnerCollectionRequestDetail,
} from "@/services/partner";

type TimelineRow = {
  id: string;
  event: string;
  at: string;
  actor: string;
  detail: string;
};

function money(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return `₹${Number(value || 0).toFixed(2)}`;
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

function prettyStatus(status?: string): string {
  if (!status) return "Unknown";
  return status
    .toLowerCase()
    .split("_")
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .join(" ");
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
      return "border-slate-200 bg-slate-100 text-slate-700";
    default:
      return "border-border bg-muted text-foreground";
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load collection request details.";
}

export default function PartnerCollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id;

  const [request, setRequest] = useState<PartnerCollectionRequestDetail | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        else setRefreshing(true);

        setError(null);

        if (!requestId) {
          throw new Error("Missing collection request id.");
        }

        const payload = await getPartnerCollectionRequestDetail(requestId);
        setRequest(payload);
      } catch (err) {
        setError(toErrorMessage(err));
        setRequest(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [requestId]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const timelineRows = useMemo<TimelineRow[]>(() => {
    if (!request) return [];

    const rows: TimelineRow[] = [];

    rows.push({
      id: `${request.id}-submitted`,
      event: "Submitted",
      at: request.submitted_at || request.created_at || "",
      actor: request.partner_username || "Partner",
      detail: "Collection request created from partner workflow.",
    });

    if ((request.status || "").toUpperCase() === "UNDER_REVIEW") {
      rows.push({
        id: `${request.id}-review`,
        event: "Under Review",
        at: request.updated_at || "",
        actor: "Admin Review Queue",
        detail: "Request is currently under admin verification.",
      });
    }

    if ((request.status || "").toUpperCase() === "APPROVED") {
      rows.push({
        id: `${request.id}-approved`,
        event: "Approved",
        at: request.reviewed_at || request.updated_at || "",
        actor: request.reviewed_by_username || "Admin",
        detail:
          request.approved_payment_id || request.approved_emi_id
            ? `Approved into payment #${request.approved_payment_id ?? "—"} and EMI #${
                request.approved_emi_id ?? "—"
              }.`
            : "Approved by admin verification.",
      });
    }

    if ((request.status || "").toUpperCase() === "REJECTED") {
      rows.push({
        id: `${request.id}-rejected`,
        event: "Rejected",
        at: request.reviewed_at || request.updated_at || "",
        actor: request.reviewed_by_username || "Admin",
        detail: request.review_note || "Request rejected during admin verification.",
      });
    }

    if ((request.status || "").toUpperCase() === "CANCELLED") {
      rows.push({
        id: `${request.id}-cancelled`,
        event: "Cancelled",
        at: request.updated_at || "",
        actor: request.reviewed_by_username || request.partner_username || "Partner/Admin",
        detail: request.review_note || "Request cancelled.",
      });
    }

    return rows.filter((row) => row.at);
  }, [request]);

  const statusText = useMemo(() => prettyStatus(request?.status), [request?.status]);

  return (
    <PortalPage
      title={
        request ? `Collection Request #${request.id}` : "Collection Request Detail"
      }
      subtitle="Track partner-submitted collection request status, review outcome, and verification result."
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Collections", href: "/partner/collections" },
        { label: request ? `#${request.id}` : "Detail" },
      ]}
      stats={[
        {
          label: "Subscription",
          value: request?.subscription_number || "—",
        },
        {
          label: "Amount",
          value: money(request?.amount),
        },
        {
          label: "Method",
          value: request?.method || "—",
        },
        {
          label: "Status",
          value: statusText,
        },
      ]}
      actions={[
        {
          href: "/partner/collections",
          label: "Back to Collections",
          variant: "secondary",
        },
        request?.subscription_id
          ? {
              href: `/partner/collections/create?subscription=${request.subscription_id}`,
              label: "New Request",
              variant: "primary",
            }
          : {
              href: "/partner/collections/create",
              label: "New Request",
              variant: "primary",
            },
      ]}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing}
            className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading collection request..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load collection request"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !request ? (
          <EmptyState
            title="Collection request not found"
            description="The requested partner collection record is not visible in the current partner scope."
          />
        ) : null}

        {!loading && !error && request ? (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">
                    Request Overview
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    This record represents partner-side collection progress. Final
                    payment truth appears only after admin verification.
                  </p>
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${statusTone(
                    request.status
                  )}`}
                >
                  {statusText}
                </span>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Customer
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {request.customer_name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {request.customer_phone || "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Payment Date
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {formatDate(request.payment_date)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Submitted
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {formatDateTime(request.submitted_at || request.created_at)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Reference
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {request.reference_no || "—"}
                  </div>
                </div>
              </div>

              {request.notes ? (
                <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Partner Note
                  </div>
                  <div className="mt-1">{request.notes}</div>
                </div>
              ) : null}

              {request.review_note ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Review Note
                  </div>
                  <div className="mt-1">{request.review_note}</div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-card-foreground">
                  Verification outcome
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Approved request links are shown only when the backend has recorded
                  the resulting payment or EMI relationship.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Reviewed By
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {request.reviewed_by_username || "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Reviewed At
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {formatDateTime(request.reviewed_at)}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Approved Payment
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {request.approved_payment_id
                      ? `#${request.approved_payment_id}`
                      : "—"}
                  </div>
                </div>
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Approved EMI
                  </div>
                  <div className="mt-2 font-medium text-foreground">
                    {request.approved_emi_id ? `#${request.approved_emi_id}` : "—"}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-card-foreground">
                  Request timeline
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Timeline items are derived from the request record itself, not from a
                  client-side list snapshot.
                </p>
              </div>

              <DataTable<TimelineRow>
                rows={timelineRows}
                emptyText="No timeline entries available."
                columns={[
                  { key: "event", title: "Event" },
                  {
                    key: "at",
                    title: "At",
                    render: (row) => formatDateTime(row.at),
                  },
                  { key: "actor", title: "Actor" },
                  { key: "detail", title: "Detail" },
                ]}
              />
            </section>
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
