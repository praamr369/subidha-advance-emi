"use client";

import { RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ActionButton from "@/components/ui/ActionButton";
import ERPPageShell from "@/components/erp/ERPPageShell";
import {
  WorkspaceNotice,
  WorkspaceTimeline,
  type WorkspaceTimelineItem,
} from "@/components/ui/role-workspace";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
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

export default function CustomerSubscriptionRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const [request, setRequest] = useState<SubscriptionRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!requestId) {
        setError("Request id is missing.");
        setLoading(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getSubscriptionRequest("customer", requestId);
        setRequest(payload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setRequest(null);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [requestId]
  );

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

  const timelineItems = useMemo<WorkspaceTimelineItem[]>(() => {
    if (!request) return [];

    const items: WorkspaceTimelineItem[] = [
      {
        id: `${request.id}-submitted`,
        title: "Request submitted",
        description:
          "The customer intake request is stored separately from live subscription truth until admin review completes.",
        timestamp: formatDateTime(request.created_at),
        badge: <ERPStatusBadge status="SUBMITTED" label="Submitted" />,
      },
    ];

    if (request.reviewed_at) {
      items.push({
        id: `${request.id}-reviewed`,
        title:
          request.status === "APPROVED"
            ? "Request approved"
            : request.status === "REJECTED"
              ? "Request rejected"
              : "Request reviewed",
        description: text(
          request.review_note,
          "Review action was recorded without a detailed note."
        ),
        timestamp: formatDateTime(request.reviewed_at),
        badge: <ERPStatusBadge status={request.status} />,
        meta: request.reviewed_by_username
          ? `Reviewed by ${request.reviewed_by_username}`
          : undefined,
      });
    }

    if (request.status === "CANCELLED") {
      items.push({
        id: `${request.id}-cancelled`,
        title: "Request cancelled",
        description:
          "The customer cancelled the intake request before approval created a live subscription.",
        timestamp: formatDateTime(request.updated_at),
        badge: <ERPStatusBadge status="CANCELLED" />,
      });
    }

    if (request.approved_subscription_id) {
      items.push({
        id: `${request.id}-subscription`,
        title: "Live subscription created",
        description: `Approved subscription ${text(
          request.approved_subscription_number,
          `SUB-${request.approved_subscription_id}`
        )} is now available in the customer subscription workspace.`,
        timestamp: formatDateTime(request.reviewed_at || request.updated_at),
        badge: <ERPStatusBadge status="APPROVED" label="Subscription created" />,
      });
    }

    return items;
  }, [request]);

  return (
    <ERPPageShell
      eyebrow="Customer Intake"
      title={request ? `Request #${request.id}` : "Subscription Request"}
      subtitle="Review request posture, admin decision history, and any approved subscription linkage from the customer workspace."
      helperNote="Request approval, rejection, or cancellation remains auditable here and does not silently mutate existing subscription or payment history."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        {
          label: "Subscription Requests",
          href: "/customer/subscription-requests",
        },
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
        {
          label: "Lucky number",
          value: request?.preferred_lucky_number ?? "—",
        },
        { label: "Batch", value: request?.batch_code || "—" },
        {
          label: "Approved subscription",
          value: request?.approved_subscription_number || "—",
        },
      ]}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Request posture"
          description="Latest review posture and approval outcome for this customer-created intake request."
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailItem
              label="Submitted at"
              value={formatDateTime(request?.created_at)}
            />
            <DetailItem
              label="Updated at"
              value={formatDateTime(request?.updated_at)}
            />
            <DetailItem
              label="Reviewed by"
              value={text(request?.reviewed_by_username)}
            />
            <DetailItem
              label="Reviewed at"
              value={formatDateTime(request?.reviewed_at)}
            />
          </div>
        </WorkspaceSection>

        {loading ? <ERPLoadingState label="Loading subscription request..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load subscription request"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && !request ? (
          <ERPEmptyState
            title="Request not found"
            description="The requested customer intake record could not be loaded."
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            {actionError ? (
              <WorkspaceNotice tone="danger" title="Action failed">
                {actionError}
              </WorkspaceNotice>
            ) : null}

            <SubscriptionRequestCard request={request} />

            <WorkspaceSection
              title="Review timeline"
              description="Approval, rejection, cancellation, and approved-subscription handoff remain separate and auditable."
              action={
                request.status === "SUBMITTED" ? (
                  <ActionButton
                    variant="destructive"
                    onClick={() => void handleCancel()}
                    disabled={cancelling}
                  >
                    {cancelling ? "Cancelling..." : "Cancel Request"}
                  </ActionButton>
                ) : undefined
              }
            >
              <WorkspaceTimeline items={timelineItems} />

              <div className="mt-5">
                <WorkspaceNotice
                  tone={
                    request.status === "APPROVED"
                      ? "success"
                      : request.status === "REJECTED"
                        ? "danger"
                        : request.status === "CANCELLED"
                          ? "warning"
                          : "info"
                  }
                  title="Review note"
                >
                  {text(request.review_note, "No review note recorded yet.")}
                </WorkspaceNotice>
              </div>

              {request.approved_subscription_id ? (
                <div className="mt-5">
                  <ActionButton
                    href={`/customer/subscriptions/${request.approved_subscription_id}`}
                    variant="outline"
                  >
                    Open Approved Subscription
                  </ActionButton>
                </div>
              ) : null}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
