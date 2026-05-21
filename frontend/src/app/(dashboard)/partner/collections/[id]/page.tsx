"use client";

import { RefreshCw } from "lucide-react";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import {
  WorkspaceNotice,
  WorkspaceTimeline,
  type WorkspaceTimelineItem,
} from "@/components/ui/role-workspace";
import StatusBadge from "@/components/ui/status-badge";
import {
  getPartnerCollectionRequestDetail,
  type PartnerCollectionRequestDetail,
} from "@/services/partner";

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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load collection request details.";
}

export default function PartnerCollectionDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const pathRequestId = pathname?.split("/").pop();
  const requestId = params?.id || pathRequestId;

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

  const statusText = useMemo(() => prettyStatus(request?.status), [request?.status]);

  const timelineItems = useMemo<WorkspaceTimelineItem[]>(() => {
    if (!request) return [];

    const items: WorkspaceTimelineItem[] = [
      {
        id: `${request.id}-submitted`,
        title: "Collection request submitted",
        description: "The partner submitted this collection for controlled verification rather than direct final posting.",
        timestamp: formatDateTime(request.submitted_at || request.created_at),
        badge: <StatusBadge status="SUBMITTED" label="Submitted" />,
        meta: request.partner_username ? `Partner ${request.partner_username}` : undefined,
      },
    ];

    if ((request.status || "").toUpperCase() === "UNDER_REVIEW") {
      items.push({
        id: `${request.id}-review`,
        title: "Under review",
        description: "The request is currently in the admin verification queue.",
        timestamp: formatDateTime(request.updated_at),
        badge: <StatusBadge status="UNDER_REVIEW" />,
      });
    }

    if ((request.status || "").toUpperCase() === "APPROVED") {
      items.push({
        id: `${request.id}-approved`,
        title: "Approved",
        description:
          request.approved_payment_id || request.approved_emi_id
            ? `Approved into payment #${request.approved_payment_id ?? "—"} and EMI #${request.approved_emi_id ?? "—"}.`
            : "Approved by admin verification.",
        timestamp: formatDateTime(request.reviewed_at || request.updated_at),
        badge: <StatusBadge status="APPROVED" />,
        meta: request.reviewed_by_username ? `Reviewed by ${request.reviewed_by_username}` : undefined,
      });
    }

    if ((request.status || "").toUpperCase() === "REJECTED") {
      items.push({
        id: `${request.id}-rejected`,
        title: "Rejected",
        description:
          request.review_note || "Request rejected during admin verification.",
        timestamp: formatDateTime(request.reviewed_at || request.updated_at),
        badge: <StatusBadge status="REJECTED" />,
        meta: request.reviewed_by_username ? `Reviewed by ${request.reviewed_by_username}` : undefined,
      });
    }

    if ((request.status || "").toUpperCase() === "CANCELLED") {
      items.push({
        id: `${request.id}-cancelled`,
        title: "Cancelled",
        description: request.review_note || "Request cancelled.",
        timestamp: formatDateTime(request.updated_at),
        badge: <StatusBadge status="CANCELLED" />,
      });
    }

    return items;
  }, [request]);

  return (
    <ERPPageShell
      eyebrow="Partner Collections"
      title={
        request
          ? `Collection Request #${request.id}`
          : requestId
            ? `Collection Request #${requestId}`
            : "Collection Request Detail"
      }
      subtitle="Track partner-submitted collection request status, review outcome, and any verified payment linkage from the partner workspace."
      helperNote="This record explains request progression only. Final payment truth becomes partner-visible after approval and does not bypass admin verification controls."
      helperTone="info"
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
      statusBadge={{
        label: statusText,
        tone:
          request?.status === "APPROVED"
            ? "success"
            : request?.status === "REJECTED"
              ? "danger"
              : request?.status === "UNDER_REVIEW"
                ? "info"
                : "warning",
      }}
    >
      <div className="space-y-6">
        <ERPSectionShell
          title="Request posture"
          description="Current request scope and latest verification outcome inside partner-visible boundaries."
          actions={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing}
              leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <ERPDetailGrid
            columns={4}
            items={[
              { label: "Customer", value: request?.customer_name || "—" },
              { label: "Phone", value: request?.customer_phone || "—" },
              { label: "Payment date", value: formatDate(request?.payment_date) },
              { label: "Status", value: request ? <ERPStatusBadge status={request.status} size="md" /> : "—" },
            ]}
          />
        </ERPSectionShell>

        {loading ? <ERPLoadingState label="Loading collection request..." /> : null}

        {!loading && error ? (
          <ERPErrorState
            title="Unable to load collection request"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !request ? (
          <ERPEmptyState
            title="Collection request not found"
            description="The requested partner collection record is not visible in the current partner scope."
          />
        ) : null}

        {!loading && !error && request ? (
          <>
            <ERPSectionShell
              title="Submission detail"
              description="Collection request details as submitted by the partner, before approval converts them into verified payment truth."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Subscription", value: request.subscription_number || "—" },
                  { label: "Amount", value: money(request.amount) },
                  { label: "Method", value: request.method || "—" },
                  { label: "Reference", value: request.reference_no || "—" },
                  { label: "Submitted", value: formatDateTime(request.submitted_at || request.created_at) },
                  { label: "Partner user", value: request.partner_username || "—" },
                  { label: "Reviewed by", value: request.reviewed_by_username || "—" },
                  { label: "Reviewed at", value: formatDateTime(request.reviewed_at) },
                ]}
              />

              {request.notes ? (
                <div className="mt-5">
                  <WorkspaceNotice tone="default" title="Partner note">
                    {request.notes}
                  </WorkspaceNotice>
                </div>
              ) : null}

              {request.review_note ? (
                <div className="mt-5">
                  <WorkspaceNotice
                    tone={
                      request.status === "APPROVED"
                        ? "success"
                        : request.status === "REJECTED"
                          ? "danger"
                          : "warning"
                    }
                    title="Review note"
                  >
                    {request.review_note}
                  </WorkspaceNotice>
                </div>
              ) : null}
            </ERPSectionShell>

            <ERPSectionShell
              title="Verification outcome"
              description="Approved links are shown only when the backend has recorded the resulting payment or EMI relationship."
            >
              <ERPDetailGrid
                columns={4}
                items={[
                  { label: "Reviewed by", value: request.reviewed_by_username || "—" },
                  { label: "Reviewed at", value: formatDateTime(request.reviewed_at) },
                  { label: "Approved payment", value: request.approved_payment_id ? `#${request.approved_payment_id}` : "—" },
                  { label: "Approved EMI", value: request.approved_emi_id ? `#${request.approved_emi_id}` : "—" },
                ]}
              />
            </ERPSectionShell>

            <ERPSectionShell
              title="Request timeline"
              description="Case progression derived from the request record itself, not from a client-side list snapshot."
            >
              <WorkspaceTimeline items={timelineItems} />
            </ERPSectionShell>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
