"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import {
  WorkspaceNotice,
  WorkspaceTimeline,
  type WorkspaceTimelineItem,
} from "@/components/ui/role-workspace";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import SubscriptionRequestCard from "@/domains/subscription-requests/components/SubscriptionRequestCard";
import {
  cancelPartnerSubscriptionRequest,
  getSubscriptionRequest,
  type SubscriptionRequestRecord,
} from "@/services/subscription-requests";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner subscription request.";
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

function statusTone(
  status?: string | null
): "info" | "success" | "warning" | "danger" | "default" {
  switch ((status || "").toUpperCase()) {
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "CANCELLED":
      return "warning";
    case "SUBMITTED":
      return "info";
    default:
      return "default";
  }
}

export default function PartnerSubscriptionRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = params?.id ? String(params.id) : "";

  const [request, setRequest] = useState<SubscriptionRequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (!requestId) {
      setError("Request id is missing.");
      setLoading(false);
      return;
    }

    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await getSubscriptionRequest("partner", requestId);
      setRequest(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setRequest(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [requestId]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const timelineItems = useMemo<WorkspaceTimelineItem[]>(() => {
    if (!request) {
      return [];
    }

    const items: WorkspaceTimelineItem[] = [
      {
        id: "submitted",
        title: "Request submitted",
        description:
          request.requester_username || request.partner_username
            ? `Submitted by ${text(
                request.requester_username || request.partner_username
              )}.`
            : "The partner request entered the intake queue.",
        timestamp: formatDateTime(request.created_at),
        badge: <StatusBadge status="SUBMITTED" />,
      },
    ];

    if (request.reviewed_at) {
      items.push({
        id: "reviewed",
        title: "Review recorded",
        description: text(
          request.review_note,
          request.reviewed_by_username
            ? `Reviewed by ${request.reviewed_by_username}.`
            : "Review metadata was recorded for this request."
        ),
        timestamp: formatDateTime(request.reviewed_at),
        badge: <StatusBadge status={request.status} />,
      });
    }

    if (request.approved_subscription_id) {
      items.push({
        id: "approved",
        title: "Approved into live subscription",
        description: `Approved subscription ${text(
          request.approved_subscription_number
        )} is now available in the partner subscription workspace.`,
        timestamp: formatDateTime(request.updated_at || request.reviewed_at),
        badge: <StatusBadge status="APPROVED" label="Linked subscription" />,
      });
    } else if (request.status === "REJECTED") {
      items.push({
        id: "rejected",
        title: "Request rejected",
        description: text(request.review_note, "Review notes explain the rejection posture."),
        timestamp: formatDateTime(request.updated_at || request.reviewed_at),
        badge: <StatusBadge status="REJECTED" />,
      });
    } else if (request.status === "CANCELLED") {
      items.push({
        id: "cancelled",
        title: "Request cancelled",
        description: "The partner request remains part of the audit trail even after cancellation.",
        timestamp: formatDateTime(request.updated_at),
        badge: <StatusBadge status="CANCELLED" />,
      });
    }

    return items;
  }, [request]);

  async function handleCancel() {
    if (!requestId) return;
    setCancelling(true);
    setActionError(null);
    try {
      const response = await cancelPartnerSubscriptionRequest(requestId);
      setRequest(response.request);
    } catch (err) {
      setActionError(toErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <PortalPage
      eyebrow="Partner Intake"
      title={request ? `Partner Request #${request.id}` : "Partner Subscription Request"}
      subtitle="Review the partner intake status, requested customer scope, and admin decision history for this submission."
      helperNote="This route shows intake and review posture only. Approval remains an admin action and is the only path that creates a live subscription."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Subscription Requests", href: "/partner/subscription-requests" },
        { label: request ? `Request #${request.id}` : "Detail" },
      ]}
      actions={[
        {
          href: "/partner/subscription-requests",
          label: "Back to Register",
          variant: "secondary",
        },
        {
          href: "/partner/subscription-requests/create",
          label: "New Request",
          variant: "ghost",
        },
      ]}
      statusBadge={{
        label: request?.status || "Loading",
        tone: statusTone(request?.status),
      }}
      stats={[
        { label: "Status", value: request?.status || "—" },
        { label: "Requester", value: request?.partner_username || "—" },
        { label: "Lucky Number", value: request?.preferred_lucky_number ?? "—" },
        { label: "Approved Subscription", value: request?.approved_subscription_number || "—" },
      ]}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading partner subscription request..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner subscription request"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            <WorkspaceSection
              title="Request posture"
              description="Current intake and review state for this partner request."
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
              <div className="space-y-4">
                <WorkspaceNotice
                  tone={statusTone(request.status)}
                  title={`Current status: ${request.status}`}
                  action={
                    request.status === "SUBMITTED" ? (
                      <ActionButton
                        variant="destructive"
                        onClick={() => void handleCancel()}
                        disabled={cancelling}
                        loading={cancelling}
                      >
                        {cancelling ? "Cancelling..." : "Cancel Request"}
                      </ActionButton>
                    ) : request.approved_subscription_id ? (
                      <ActionButton
                        href={`/partner/subscriptions/${request.approved_subscription_id}`}
                        variant="outline"
                      >
                        Open Approved Subscription
                      </ActionButton>
                    ) : undefined
                  }
                >
                  {request.status === "APPROVED"
                    ? "This intake request has been approved into a live subscription. Keep future payment and collection activity on the subscription workspace."
                    : request.status === "REJECTED"
                      ? "The request remains visible for review history and audit context. Rejection does not create a live subscription."
                      : request.status === "CANCELLED"
                        ? "The cancelled intake request remains visible as part of the partner request history."
                        : "The request is still pending admin review and has not created a live subscription yet."}
                </WorkspaceNotice>

                {actionError ? (
                  <WorkspaceNotice tone="danger" title="Action failed">
                    {actionError}
                  </WorkspaceNotice>
                ) : null}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Request snapshot"
              description="Submitted customer, product, and intake details as currently stored for review."
            >
              <SubscriptionRequestCard request={request} showRequester />
            </WorkspaceSection>

            <WorkspaceSection
              title="Review timeline"
              description="Partner submissions remain auditable even when cancelled, rejected, or approved into a real subscription later."
            >
              <WorkspaceTimeline items={timelineItems} />
            </WorkspaceSection>

            <WorkspaceSection
              title="Review and linkage details"
              description="Admin review metadata and live-subscription linkage, if approval has already occurred."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem label="Submitted At" value={formatDateTime(request.created_at)} />
                <DetailItem label="Updated At" value={formatDateTime(request.updated_at)} />
                <DetailItem label="Reviewed By" value={text(request.reviewed_by_username)} />
                <DetailItem label="Reviewed At" value={formatDateTime(request.reviewed_at)} />
                <DetailItem
                  label="Approved Subscription"
                  value={text(request.approved_subscription_number)}
                  className="md:col-span-2"
                />
                <DetailItem
                  label="Review note"
                  value={text(request.review_note, "No review note recorded yet.")}
                  className="md:col-span-2 xl:col-span-2"
                />
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
