"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import CustomerPageShell, { CPageCard, CPageSection } from "@/components/layout/CustomerPageShell";
import {
  cancelCustomerSubscriptionRequest,
  getSubscriptionRequest,
  type SubscriptionRequestRecord,
} from "@/services/subscription-requests";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function text(value?: string | null, fallback = "—"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right max-w-[60%] break-words">{value}</span>
    </div>
  );
}

export default function CustomerSubscriptionRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const query = useQuery({
    queryKey: ["subscriptionRequestDetail", "customer", requestId],
    queryFn: async () => {
      if (!requestId) throw new Error("Request id is missing.");
      return await getSubscriptionRequest("customer", requestId);
    },
    enabled: !!requestId,
  });

  const request = query.data || null;
  const loading = query.isLoading;
  const refreshing = query.isFetching && !query.isLoading;
  const error = query.error ? (query.error as Error).message : null;
  
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode?: string) => {
    await query.refetch();
  }, [query]);

  async function handleCancel() {
    if (!requestId) return;
    setCancelling(true);
    setActionError(null);
    try {
      const response = await cancelCustomerSubscriptionRequest(requestId);
      await query.refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setCancelling(false);
    }
  }

  const statusTone = request?.status === "APPROVED" ? "success"
    : request?.status === "REJECTED" ? "danger"
    : request?.status === "CANCELLED" ? "warning"
    : "info";

  return (
    <CustomerPageShell
      title={request ? `Request #${request.id}` : "Request Detail"}
      subtitle={request?.product_name || "Subscription request"}
      backHref="/customer/subscription-requests"
      backLabel="Requests"
      actions={
        <button
          type="button"
          onClick={() => void loadPage()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {loading ? <ERPLoadingState label="Loading request…" /> : null}

      {!loading && error ? (
        <ERPErrorState title="Unable to load request" description={error} onRetry={() => void loadPage()} />
      ) : null}

      {!loading && !error && !request ? (
        <ERPEmptyState title="Request not found" description="Could not find this request." />
      ) : null}

      {!loading && !error && request ? (
        <>
          {actionError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          ) : null}

          {/* Status card */}
          <CPageSection>
            <CPageCard>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</div>
                  <div className="mt-1">
                    <ERPStatusBadge status={request.status} />
                  </div>
                </div>
                {request.status === "SUBMITTED" ? (
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                    className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling…" : "Cancel Request"}
                  </button>
                ) : null}
              </div>
              <InfoRow label="Product" value={text(request.product_name)} />
              <InfoRow label="Batch" value={text(request.batch_code)} />
              <InfoRow label="Lucky #" value={request.preferred_lucky_number != null ? `#${String(request.preferred_lucky_number).padStart(2, "0")}` : "—"} />
              <InfoRow label="Submitted" value={formatDateTime(request.created_at)} />
              <InfoRow label="Updated" value={formatDateTime(request.updated_at)} />
            </CPageCard>
          </CPageSection>

          {/* Review details */}
          {request.reviewed_at ? (
            <CPageSection title="Admin Review">
              <CPageCard>
                <div className={`mb-3 rounded-xl px-3 py-2 text-xs font-semibold ${statusTone === "success" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : statusTone === "danger" ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400" : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"}`}>
                  {request.status === "APPROVED" ? "Approved" : request.status === "REJECTED" ? "Rejected" : "Reviewed"}
                  {request.reviewed_by_username ? ` by ${request.reviewed_by_username}` : ""}
                </div>
                {request.review_note ? (
                  <p className="text-sm text-foreground">{request.review_note}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No review note recorded.</p>
                )}
                <InfoRow label="Reviewed at" value={formatDateTime(request.reviewed_at)} />
              </CPageCard>
            </CPageSection>
          ) : null}

          {/* Approved subscription link */}
          {request.approved_subscription_id ? (
            <CPageSection title="Approved Subscription">
              <CPageCard>
                <p className="text-sm text-muted-foreground mb-3">
                  Your request was approved and a live subscription has been created.
                </p>
                <Link
                  href={`/customer/subscriptions/${request.approved_subscription_id}`}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition active:scale-95"
                >
                  View Subscription {request.approved_subscription_number ? `· ${request.approved_subscription_number}` : ""}
                </Link>
              </CPageCard>
            </CPageSection>
          ) : null}

          {/* Notice */}
          <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            This request is separate from your live subscription records. Approval, rejection, or cancellation is auditable here.
          </div>
        </>
      ) : null}
    </CustomerPageShell>
  );
}
