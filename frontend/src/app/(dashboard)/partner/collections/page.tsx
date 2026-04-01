"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import PortalPage from "@/components/ui/PortalPage";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/status-badge";
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

function normalizeCollectionRequestRow(item: Record<string, unknown>): CollectionRequestRow {
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

function normalizeVerifiedPaymentRow(item: Record<string, unknown>): VerifiedPaymentRow {
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

  return (
    <PortalPage
      title="Partner Collections"
      subtitle="Track submitted field collections, review progress, and understand when EMI becomes finally verified."
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
          label: "Subscriptions",
          href: "/partner/subscriptions",
          variant: "secondary",
        },
      ]}
      stats={[
        { label: "Submitted", value: submittedCount },
        { label: "Under Review", value: underReviewCount },
        { label: "Approved", value: approvedCount },
        { label: "Rejected", value: rejectedCount },
      ]}
    >
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void loadPage("refresh")}
          disabled={refreshing}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? <LoadingBlock label="Loading partner collections..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner collections"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-card-foreground">
              Workflow boundary
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Partner-side collection activity is operational progress, not final
              payment truth. EMI should be treated as paid only after controlled
              backend verification and admin approval. Submitted requests help you
              track field activity, while verified payments reflect finalized system truth.
            </p>
          </section>

          {!hasAnyCollectionData ? (
            <EmptyState
              title="No collection workflow activity"
              description="No submitted requests, verified payments, or follow-up items are currently available in this partner scope."
            />
          ) : (
            <>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-card-foreground">
                      Submitted collection requests
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Requests created by partner field collection workflow and waiting for
                      admin review or final decision.
                    </p>
                  </div>

                  <Link
                    href="/partner/collections/create"
                    className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                  >
                    New Request
                  </Link>
                </div>

                {requests.length === 0 ? (
                  <EmptyState
                    title="No submitted collection requests"
                    description="No partner collection requests matched the current collection workspace."
                  />
                ) : (
                  <DataTable<CollectionRequestRow>
                    rows={requests}
                    emptyText="No collection requests available."
                    columns={[
                      {
                        key: "subscription_code",
                        title: "Subscription",
                        render: (row) => (
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">
                              {row.subscription_code}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.customer_name}
                            </div>
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
                      {
                        key: "actions",
                        title: "Actions",
                        render: (row) => (
                          <div className="flex flex-col items-start gap-2">
                            <Link
                              href={`/partner/collections/${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Request Detail
                            </Link>
                            {typeof row.subscription_id === "number" ? (
                              <Link
                                href={`/partner/collections/create?subscription=${row.subscription_id}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                New Request
                              </Link>
                            ) : null}
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-card-foreground">
                    Recently verified payments
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    These rows represent finalized payment visibility after admin verification.
                  </p>
                </div>

                {verifiedPayments.length === 0 ? (
                  <EmptyState
                    title="No verified payments visible"
                    description="No verified partner-visible payment rows are currently available."
                  />
                ) : (
                  <DataTable<VerifiedPaymentRow>
                    rows={verifiedPayments}
                    emptyText="No verified payments available."
                    columns={[
                      {
                        key: "subscription_code",
                        title: "Subscription",
                        render: (row) => (
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">
                              {row.subscription_code}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.customer_name}
                            </div>
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
                      {
                        key: "actions",
                        title: "Actions",
                        render: (row) => (
                          <div className="flex flex-col items-start gap-2">
                            <Link
                              href={
                                row.subscription_id
                                  ? `/partner/payments?subscription=${row.subscription_id}`
                                  : "/partner/payments"
                              }
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Open Payments
                            </Link>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-card-foreground">
                    Follow-up queue
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Requests needing re-submission, trace clarification, or partner action.
                  </p>
                </div>

                {followUpQueue.length === 0 ? (
                  <EmptyState
                    title="No follow-up queue items"
                    description="No partner follow-up items currently require action."
                  />
                ) : (
                  <DataTable<CollectionRequestRow>
                    rows={followUpQueue}
                    emptyText="No follow-up queue items."
                    columns={[
                      {
                        key: "subscription_code",
                        title: "Subscription",
                        render: (row) => (
                          <div className="space-y-1">
                            <div className="font-medium text-foreground">
                              {row.subscription_code}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {row.customer_name}
                            </div>
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
                        key: "status",
                        title: "Status",
                        render: (row) => <StatusBadge status={row.status} />,
                      },
                      {
                        key: "review_note",
                        title: "Review Note",
                        render: (row) => row.review_note || "—",
                      },
                      {
                        key: "actions",
                        title: "Actions",
                        render: (row) => (
                          <div className="flex flex-col items-start gap-2">
                            <Link
                              href={`/partner/collections/${row.id}`}
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Request Detail
                            </Link>
                            <Link
                              href="/partner/collections/create"
                              className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                            >
                              Submit New Request
                            </Link>
                          </div>
                        ),
                      },
                    ]}
                  />
                )}
              </section>
            </>
          )}
        </div>
      ) : null}
    </PortalPage>
  );
}
