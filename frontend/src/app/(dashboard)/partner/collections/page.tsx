"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import DataTable, { type Column } from "@/components/ui/DataTable";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceNotice } from "@/components/ui/role-workspace";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getPartnerDashboard } from "@/services/partner";

type DashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;

type CollectionRequestRow = {
  id: string;
  subscription_id?: number;
  subscription_code: string;
  customer_name: string;
  amount: string;
  method: string;
  payment_date: string;
  submitted_at: string;
  status: string;
  reference_no: string;
  review_note: string;
};

type VerifiedPaymentRow = {
  id: string;
  subscription_id?: number;
  subscription_code: string;
  customer_name: string;
  amount: string;
  method: string;
  payment_date: string;
  verified_at: string;
  reference_no: string;
};

function money(value?: string | number | null): string {
  if (value === undefined || value === null || value === "") return "—";
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
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

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner collection workspace.";
}

function normalizeCollectionRequestRow(
  item: Record<string, unknown>
): CollectionRequestRow {
  const subscriptionId =
    toNumber(item.subscription_id) ?? toNumber(item.subscription) ?? undefined;

  return {
    id: String(item.id ?? ""),
    subscription_id: subscriptionId,
    subscription_code:
      toText(item.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : "—"),
    customer_name: toText(item.customer_name, "Unknown customer"),
    amount: String(item.amount ?? "0"),
    method: toText(item.method, "—"),
    payment_date: toText(item.payment_date),
    submitted_at: toText(item.submitted_at) || toText(item.created_at),
    status: toText(item.status, "SUBMITTED"),
    reference_no: toText(item.reference_no, "—"),
    review_note: toText(item.review_note, ""),
  };
}

function normalizeVerifiedPaymentRow(
  item: Record<string, unknown>
): VerifiedPaymentRow {
  const subscriptionId =
    toNumber(item.subscription_id) ?? toNumber(item.subscription) ?? undefined;

  return {
    id: String(item.id ?? ""),
    subscription_id: subscriptionId,
    subscription_code:
      toText(item.subscription_number) ||
      (subscriptionId ? `SUB-${subscriptionId}` : "—"),
    customer_name: toText(item.customer_name, "Unknown customer"),
    amount: String(item.amount ?? "0"),
    method: toText(item.method, "—"),
    payment_date: toText(item.payment_date),
    verified_at: toText(item.verified_at) || toText(item.created_at),
    reference_no: toText(item.reference_no, "—"),
  };
}

export default function PartnerCollectionsPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const payload = await getPartnerDashboard();
      setData(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const dynamicCollectionsData = useMemo(() => {
    const root = (data ?? {}) as Record<string, unknown>;

    const recentCollectionRequests = asArray(root.recent_collection_requests).map(
      normalizeCollectionRequestRow
    );

    const recentVerifiedPayments = asArray(root.recent_verified_payments).map(
      normalizeVerifiedPaymentRow
    );

    const followUpQueue = asArray(root.follow_up_queue).map(
      normalizeCollectionRequestRow
    );

    return {
      recentCollectionRequests,
      recentVerifiedPayments,
      followUpQueue,
    };
  }, [data]);

  const requests = dynamicCollectionsData.recentCollectionRequests;
  const verifiedPayments = dynamicCollectionsData.recentVerifiedPayments;
  const followUpQueue = dynamicCollectionsData.followUpQueue;

  const approvedCount = useMemo(
    () => requests.filter((item) => item.status.toUpperCase() === "APPROVED").length,
    [requests]
  );

  const underReviewCount = useMemo(
    () =>
      requests.filter((item) => item.status.toUpperCase() === "UNDER_REVIEW").length,
    [requests]
  );

  const submittedCount = useMemo(
    () => requests.filter((item) => item.status.toUpperCase() === "SUBMITTED").length,
    [requests]
  );

  const rejectedCount = useMemo(
    () => requests.filter((item) => item.status.toUpperCase() === "REJECTED").length,
    [requests]
  );

  const hasAnyCollectionData =
    requests.length > 0 || verifiedPayments.length > 0 || followUpQueue.length > 0;

  const requestColumns = useMemo<Column<CollectionRequestRow>[]>(
    () => [
      {
        key: "subscription_code",
        title: "Subscription",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.subscription_code}</div>
            <div className="text-xs text-muted-foreground">{row.customer_name}</div>
          </div>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        render: (row) => money(row.amount),
      },
      {
        key: "method",
        title: "Method",
      },
      {
        key: "payment_date",
        title: "Collection Date",
        render: (row) => formatDate(row.payment_date),
      },
      {
        key: "submitted_at",
        title: "Submitted At",
        render: (row) => formatDateTime(row.submitted_at),
      },
      {
        key: "status",
        title: "Status",
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: "reference_no",
        title: "Reference",
        render: (row) => row.reference_no || "—",
      },
    ],
    []
  );

  const verifiedColumns = useMemo<Column<VerifiedPaymentRow>[]>(
    () => [
      {
        key: "subscription_code",
        title: "Subscription",
        render: (row) => (
          <div className="space-y-1">
            <div className="font-medium text-foreground">{row.subscription_code}</div>
            <div className="text-xs text-muted-foreground">{row.customer_name}</div>
          </div>
        ),
      },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        render: (row) => money(row.amount),
      },
      {
        key: "method",
        title: "Method",
      },
      {
        key: "payment_date",
        title: "Payment Date",
        render: (row) => formatDate(row.payment_date),
      },
      {
        key: "verified_at",
        title: "Verified At",
        render: (row) => formatDateTime(row.verified_at),
      },
      {
        key: "reference_no",
        title: "Reference",
        render: (row) => row.reference_no || "—",
      },
    ],
    []
  );

  return (
    <PortalPage
      eyebrow="Partner Collections"
      title="Collection Workspace"
      subtitle="Track submitted field collections, review progress, and the verified payment rows that become partner-visible only after controlled approval."
      helperNote="Partner collection requests are operational intake, not final payment truth. Verified payments appear only after backend verification and admin approval complete."
      helperTone="info"
      breadcrumbs={[
        { label: "Partner", href: "/partner" },
        { label: "Collections" },
      ]}
      actions={[
        {
          label: "Submit Collection",
          href: "/partner/collections/create",
          variant: "primary",
        },
        {
          label: "Payments",
          href: "/partner/payments",
          variant: "secondary",
        },
        {
          label: "Customers",
          href: "/partner/customers",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Submitted", value: submittedCount },
        { label: "Under review", value: underReviewCount, tone: "warning" },
        { label: "Approved", value: approvedCount, tone: "success" },
        {
          label: "Rejected",
          value: rejectedCount,
          tone: rejectedCount > 0 ? "danger" : "default",
        },
      ]}
      statusBadge={{ label: "Partner collection scope", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Collection boundary"
          description="Use this workspace to understand where a partner-submitted collection is in the pipeline without crossing into admin finance or reconciliation controls."
          action={
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
          <WorkspaceNotice tone="info" title="Operational separation">
            Submitted requests represent field collection activity. Verified payments below represent finalized partner-visible truth after approval. Neither surface exposes admin-only payout, reversal, or reconciliation controls.
          </WorkspaceNotice>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading partner collections..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner collections"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            {!hasAnyCollectionData ? (
              <WorkspaceSection
                title="Collection activity"
                description="No submitted requests, verified payments, or follow-up items are currently available in this partner scope."
              >
                <EmptyState
                  title="No collection workflow activity"
                  description="Create a new collection request to begin the partner collection flow."
                  action={
                    <ActionButton href="/partner/collections/create" variant="outline">
                      Submit collection
                    </ActionButton>
                  }
                />
              </WorkspaceSection>
            ) : (
              <>
                <WorkspaceSection
                  title="Submitted collection requests"
                  description="Partner-created requests waiting for review or final decision."
                >
                  {requests.length === 0 ? (
                    <EmptyState
                      title="No submitted collection requests"
                      description="No partner collection requests matched the current workspace."
                    />
                  ) : (
                    <DataTable<CollectionRequestRow>
                      rows={requests}
                      columns={requestColumns}
                      rowActions={(row) => (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            href={`/partner/collections/${row.id}`}
                            variant="outline"
                          >
                            Request detail
                          </ActionButton>
                          {typeof row.subscription_id === "number" ? (
                            <ActionButton
                              href={`/partner/collections/create?subscription=${row.subscription_id}`}
                              variant="outline"
                            >
                              New request
                            </ActionButton>
                          ) : null}
                        </div>
                      )}
                    />
                  )}
                </WorkspaceSection>

                <WorkspaceSection
                  title="Recently verified payments"
                  description="These rows represent finalized payment visibility after approval and verification."
                >
                  {verifiedPayments.length === 0 ? (
                    <EmptyState
                      title="No verified payments visible"
                      description="No verified partner-visible payment rows are currently available."
                    />
                  ) : (
                    <DataTable<VerifiedPaymentRow>
                      rows={verifiedPayments}
                      columns={verifiedColumns}
                      rowActions={(row) => (
                        <ActionButton
                          href={
                            row.subscription_id
                              ? `/partner/payments?subscription=${row.subscription_id}`
                              : "/partner/payments"
                          }
                          variant="outline"
                        >
                          Open payments
                        </ActionButton>
                      )}
                    />
                  )}
                </WorkspaceSection>

                <WorkspaceSection
                  title="Follow-up queue"
                  description="Requests needing re-submission, trace clarification, or partner action."
                >
                  {followUpQueue.length === 0 ? (
                    <EmptyState
                      title="No follow-up queue items"
                      description="No partner follow-up items currently require action."
                    />
                  ) : (
                    <DataTable<CollectionRequestRow>
                      rows={followUpQueue}
                      columns={[
                        ...requestColumns.slice(0, 2),
                        {
                          key: "status",
                          title: "Status",
                          render: (row) => <StatusBadge status={row.status} />,
                        },
                        {
                          key: "review_note",
                          title: "Review Note",
                          render: (row) => row.review_note || "—",
                        },
                      ]}
                      rowActions={(row) => (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            href={`/partner/collections/${row.id}`}
                            variant="outline"
                          >
                            Request detail
                          </ActionButton>
                          <ActionButton
                            href={
                              row.subscription_id
                                ? `/partner/collections/create?subscription=${row.subscription_id}`
                                : "/partner/collections/create"
                            }
                            variant="outline"
                          >
                            Submit new request
                          </ActionButton>
                        </div>
                      )}
                    />
                  )}
                </WorkspaceSection>
              </>
            )}
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
