"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import SubscriptionRequestCard from "@/domains/subscription-requests/components/SubscriptionRequestCard";
import {
  cancelCustomerSubscriptionRequest,
  getSubscriptionRequest,
  type SubscriptionRequestRecord,
} from "@/services/subscription-requests";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load subscription request.";
}

function formatDateTime(value?: string | null): string {
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

function text(value?: string | null, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm text-slate-900">{value}</div>
    </div>
  );
}

export default function CustomerSubscriptionRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const [request, setRequest] = useState<SubscriptionRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await getSubscriptionRequest("customer", requestId);
      setRequest(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setRequest(null);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleCancel() {
    if (!requestId) return;
    setCancelling(true);
    setActionError(null);
    try {
      const response = await cancelCustomerSubscriptionRequest(requestId);
      setRequest(response.request);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <PortalPage
      title={request ? `Request #${request.id}` : "Subscription Request"}
      subtitle="Review the pending approval status, requested product details, and admin decision history for this customer request."
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Subscription Requests", href: "/customer/subscription-requests" },
        { label: request ? `Request #${request.id}` : "Detail" },
      ]}
      actions={[
        {
          href: "/customer/subscription-requests",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: "/customer/subscription-requests/create",
          label: "New Request",
          variant: "ghost",
        },
      ]}
      statusBadge={{
        label: request?.status || "Loading",
        tone:
          request?.status === "APPROVED"
            ? "success"
            : request?.status === "REJECTED"
              ? "danger"
              : request?.status === "CANCELLED"
                ? "warning"
                : "info",
      }}
      stats={[
        { label: "Status", value: request?.status || "—" },
        { label: "Lucky Number", value: request?.preferred_lucky_number ?? "—" },
        { label: "Batch", value: request?.batch_code || "—" },
        { label: "Approved Subscription", value: request?.approved_subscription_number || "—" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading subscription request..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load subscription request"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? (
              <ErrorState title="Action failed" description={actionError} />
            ) : null}

            <SubscriptionRequestCard request={request} />

            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Review timeline
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Approval, rejection, or cancellation stays auditable and separate from active subscription truth.
                  </p>
                </div>

                {request.status === "SUBMITTED" ? (
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-red-300 bg-red-50 px-4 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cancelling ? "Cancelling..." : "Cancel Request"}
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Submitted At" value={formatDateTime(request.created_at)} />
                <DetailItem label="Updated At" value={formatDateTime(request.updated_at)} />
                <DetailItem label="Reviewed By" value={text(request.reviewed_by_username)} />
                <DetailItem label="Reviewed At" value={formatDateTime(request.reviewed_at)} />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Review note
                </div>
                <div className="mt-2 text-sm text-slate-900">
                  {text(request.review_note, "No review note recorded yet.")}
                </div>
              </div>

              {request.approved_subscription_id ? (
                <div className="mt-4">
                  <Link
                    href={`/customer/subscriptions/${request.approved_subscription_id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Open Approved Subscription
                  </Link>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
