"use client";

import { RefreshCw } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import {
  WorkspaceNotice,
  WorkspaceTimeline,
  type WorkspaceTimelineItem,
} from "@/components/ui/role-workspace";
import StatusBadge from "@/components/ui/status-badge";
import { DetailItem, WorkspaceSection } from "@/components/ui/workspace";
import {
  getCustomerSupportRequest,
  type CustomerSupportRequest,
} from "@/services/customer";

function formatDateTime(value: string | null | undefined): string {
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

function formatCategoryLabel(value: string | null | undefined): string {
  return (value || "OTHER").replaceAll("_", " ");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Unable to load support request detail.";
}

export default function CustomerSupportRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const requestId = Number(params?.id ?? 0);

  const [supportRequest, setSupportRequest] =
    useState<CustomerSupportRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!Number.isFinite(requestId) || requestId <= 0) {
        setSupportRequest(null);
        setError("Invalid support request id.");
        setLoading(false);
        return;
      }

      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const payload = await getCustomerSupportRequest(requestId);
        setSupportRequest(payload);
        setError(null);
      } catch (err) {
        setSupportRequest(null);
        setError(toErrorMessage(err));
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
    void loadPage("initial");
  }, [loadPage]);

  const timelineItems = useMemo<WorkspaceTimelineItem[]>(() => {
    if (!supportRequest) return [];

    const items: WorkspaceTimelineItem[] = [
      {
        id: `${supportRequest.id}-submitted`,
        title: "Support request submitted",
        description:
          supportRequest.payment_reference_no || supportRequest.subscription_number
            ? "The request was created with linked receipt or subscription context."
            : "The request was created as a general account query.",
        timestamp: formatDateTime(supportRequest.created_at),
        badge: <StatusBadge status="SUBMITTED" label="Submitted" />,
        meta: (
          <>
            Category {formatCategoryLabel(supportRequest.category)}
            {supportRequest.payment_reference_no
              ? ` · Ref ${supportRequest.payment_reference_no}`
              : ""}
          </>
        ),
      },
    ];

    if (supportRequest.updated_at && supportRequest.updated_at !== supportRequest.created_at) {
      items.push({
        id: `${supportRequest.id}-updated`,
        title: "Request updated",
        description: "Branch review or case progression updated the request record.",
        timestamp: formatDateTime(supportRequest.updated_at),
        badge: <StatusBadge status={supportRequest.status || "OPEN"} />,
      });
    }

    if (supportRequest.resolved_at || String(supportRequest.status).toUpperCase() === "CLOSED") {
      items.push({
        id: `${supportRequest.id}-resolved`,
        title: "Resolution recorded",
        description:
          supportRequest.resolution_summary ||
          "The request was closed without a customer-visible resolution summary.",
        timestamp: formatDateTime(supportRequest.resolved_at || supportRequest.updated_at),
        badge: <StatusBadge status="CLOSED" label="Closed" />,
      });
    }

    return items;
  }, [supportRequest]);

  return (
    <PortalPage
      eyebrow="Customer Support"
      title={
        supportRequest
          ? `Support Request #${supportRequest.id}`
          : "Support Request Detail"
      }
      subtitle="Track the current state of a customer-submitted support request without leaving the customer workspace shell."
      helperNote="Support timelines explain review progress only. Receipt, payment, and subscription records remain the source of financial truth."
      helperTone="info"
      breadcrumbs={[
        { label: "Customer", href: "/customer" },
        { label: "Support", href: "/customer/support" },
        {
          label: supportRequest
            ? `Request #${supportRequest.id}`
            : "Request Detail",
        },
      ]}
      actions={[
        {
          href: "/customer/support",
          label: "Back to Support",
          variant: "primary",
        },
        supportRequest?.payment
          ? {
              href: `/customer/payments/${supportRequest.payment}`,
              label: "Receipt",
              variant: "secondary",
            }
          : {
              href: "/customer/payments",
              label: "Payments",
              variant: "secondary",
            },
        supportRequest?.subscription
          ? {
              href: `/customer/subscriptions/${supportRequest.subscription}`,
              label: "Subscription",
              variant: "secondary",
            }
          : {
              href: "/customer/subscriptions",
              label: "Subscriptions",
              variant: "secondary",
            },
      ]}
      stats={[
        {
          label: "Status",
          value: supportRequest?.status || "—",
          tone:
            supportRequest?.status === "CLOSED"
              ? "success"
              : supportRequest?.status === "UNDER_REVIEW"
                ? "info"
                : "warning",
        },
        {
          label: "Category",
          value: formatCategoryLabel(supportRequest?.category),
        },
        {
          label: "Submitted",
          value: formatDateTime(supportRequest?.created_at),
        },
        {
          label: "Updated",
          value: formatDateTime(supportRequest?.updated_at),
        },
      ]}
      statusBadge={{
        label: supportRequest?.status || "Customer support tracking",
        tone:
          supportRequest?.status === "CLOSED"
            ? "success"
            : supportRequest?.status === "UNDER_REVIEW"
              ? "info"
              : "warning",
      }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Request posture"
          description="Current request scope and branch-visible progress from the customer support record."
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
              label="Request reference"
              value={supportRequest ? `Request #${supportRequest.id}` : "—"}
            />
            <DetailItem
              label="Status"
              value={
                supportRequest ? (
                  <StatusBadge status={supportRequest.status || "OPEN"} size="md" />
                ) : (
                  "—"
                )
              }
            />
            <DetailItem
              label="Submitted at"
              value={formatDateTime(supportRequest?.created_at)}
            />
            <DetailItem
              label="Last updated"
              value={formatDateTime(supportRequest?.updated_at)}
            />
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading support request..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load support request"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !supportRequest ? (
          <EmptyState
            title="Support request not found"
            description="The requested support record could not be loaded from your account."
          />
        ) : null}

        {!loading && !error && supportRequest ? (
          <>
            <WorkspaceSection
              title="Issue detail"
              description="Exact issue scope and linked record context submitted from your customer account."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailItem
                  label="Category"
                  value={formatCategoryLabel(supportRequest.category)}
                />
                <DetailItem
                  label="Linked payment"
                  value={
                    supportRequest.payment_reference_no
                      ? `Ref ${supportRequest.payment_reference_no}`
                      : supportRequest.payment
                        ? `Payment #${supportRequest.payment}`
                        : "No payment attached"
                  }
                />
                <DetailItem
                  label="Linked subscription"
                  value={
                    supportRequest.subscription_number ||
                    (supportRequest.subscription
                      ? `SUB-${supportRequest.subscription}`
                      : "No subscription attached")
                  }
                />
                <DetailItem
                  label="Payment date"
                  value={formatDateTime(supportRequest.payment_date)}
                />
              </div>

              <div className="mt-4 rounded-[1.35rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                <div className="enterprise-eyebrow">Submitted message</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {supportRequest.message || "No message submitted."}
                </div>
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Support timeline"
              description="Case milestones derived from the customer support record itself."
            >
              <WorkspaceTimeline items={timelineItems} />
            </WorkspaceSection>

            <WorkspaceSection
              title="Resolution"
              description="A resolution summary appears here once the request is closed."
            >
              {String(supportRequest.status).toUpperCase() === "CLOSED" ? (
                <WorkspaceNotice tone="success" title="Request closed">
                  <div>{supportRequest.resolution_summary || "The request was closed without a customer-visible resolution summary."}</div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-emerald-800">
                    Resolved {formatDateTime(supportRequest.resolved_at || supportRequest.updated_at)}
                  </div>
                </WorkspaceNotice>
              ) : (
                <WorkspaceNotice tone="info" title="Resolution pending">
                  The branch has not closed this request yet. Check the timeline above for the latest review movement.
                </WorkspaceNotice>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
