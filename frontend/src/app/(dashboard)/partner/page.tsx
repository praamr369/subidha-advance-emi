"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  RefreshCw,
  Users,
} from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { getPartnerDashboard } from "@/services/partner";

type DashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;

type Summary = {
  total_customers?: number;
  active_subscriptions?: number;
  pending_emis?: number;
  overdue_emis?: number;
  total_revenue_collected?: string | number;
  pending_commission?: string | number;
  settled_commission?: string | number;
  submitted_collection_requests?: number;
  under_review_collection_requests?: number;
  approved_collection_requests?: number;
  rejected_collection_requests?: number;
};

type DueSubscription = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  product_name?: string;
  batch_code?: string;
  lucky_number?: string | number;
  due_date?: string;
  monthly_amount?: string | number;
  overdue_days?: number;
  pending_amount?: string | number;
};

type RecentCollectionRequest = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  amount?: string | number;
  method?: string;
  payment_date?: string;
  submitted_at?: string;
  status?: string;
  reference_no?: string;
};

type RecentVerifiedPayment = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  amount?: string | number;
  method?: string;
  paid_at?: string;
};

type FollowUpItem = {
  id: number | string;
  subscription_id?: number | string;
  subscription_number?: string;
  customer_name?: string;
  customer_phone?: string;
  reason?: string;
  overdue_days?: number;
  pending_amount?: string | number;
};

function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner dashboard.";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold text-card-foreground">
            {value}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-2 text-muted-foreground">
          {icon}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1">{description}</p>
    </div>
  );
}

export default function PartnerDashboardPage() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
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
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const summary: Summary = useMemo(() => {
    return (data?.summary as Summary | undefined) ?? {};
  }, [data]);

  const dueSubscriptions = useMemo(
    () => asArray<DueSubscription>(data?.due_subscriptions),
    [data]
  );

  const recentCollectionRequests = useMemo(
    () => asArray<RecentCollectionRequest>(data?.recent_collection_requests),
    [data]
  );

  const recentVerifiedPayments = useMemo(
    () => asArray<RecentVerifiedPayment>(data?.recent_verified_payments),
    [data]
  );

  const followUpQueue = useMemo(
    () => asArray<FollowUpItem>(data?.follow_up_queue),
    [data]
  );

  const stats = useMemo(() => {
    return [
      {
        label: "Active Customers",
        value: summary.total_customers ?? 0,
      },
      {
        label: "Active Subscriptions",
        value: summary.active_subscriptions ?? 0,
      },
      {
        label: "Verified Collections",
        value: money(summary.total_revenue_collected ?? 0),
      },
      {
        label: "Pending Commission",
        value: money(summary.pending_commission ?? 0),
      },
    ];
  }, [summary]);

  return (
    <PortalPage
      title="Partner Dashboard"
      subtitle="Track field collections, pending verification, commissions, and customer follow-up from one operational workspace."
      breadcrumbs={[{ label: "Partner" }]}
      stats={stats}
      actions={[
        {
          href: "/partner/collections/create",
          label: "Submit Collection",
          variant: "primary",
        },
        {
          href: "/partner/subscription-requests",
          label: "Subscription Requests",
          variant: "secondary",
        },
        {
          href: "/partner/collections",
          label: "Open Collection Queue",
        },
      ]}
    >
      {loading ? <LoadingBlock label="Loading partner dashboard..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load partner dashboard"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Field Operations Summary
              </h2>
              <p className="text-sm text-muted-foreground">
                Partner-side progress can be visible immediately, but EMI is
                financially treated as paid only after admin verification.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Due EMI"
              value={summary.pending_emis ?? 0}
              subtitle="Subscriptions currently needing collection follow-up."
              icon={<Clock3 className="h-5 w-5" />}
            />
            <StatCard
              title="Overdue EMI"
              value={summary.overdue_emis ?? 0}
              subtitle="Accounts needing urgent field recovery attention."
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            <StatCard
              title="Under Verification"
              value={summary.under_review_collection_requests ?? 0}
              subtitle="Collection requests awaiting admin review."
              icon={<FileCheck2 className="h-5 w-5" />}
            />
            <StatCard
              title="Settled Commission"
              value={money(summary.settled_commission ?? 0)}
              subtitle="Commission already approved and settled."
              icon={<CircleDollarSign className="h-5 w-5" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-card-foreground">
                  Collection Pipeline
                </h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">Submitted</span>
                  <span className="text-sm font-semibold text-foreground">
                    {summary.submitted_collection_requests ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">
                    Under Review
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {summary.under_review_collection_requests ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">Approved</span>
                  <span className="text-sm font-semibold text-foreground">
                    {summary.approved_collection_requests ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2">
                  <span className="text-sm text-muted-foreground">Rejected</span>
                  <span className="text-sm font-semibold text-foreground">
                    {summary.rejected_collection_requests ?? 0}
                  </span>
                </div>
              </div>

              <div className="mt-4">
                <Link
                  href="/partner/collections"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:underline"
                >
                  View full queue
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-3">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Due Collection Queue
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Prioritize these subscriptions for field collection.
                  </p>
                </div>

                <Link
                  href="/partner/subscriptions"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Subscriptions
                </Link>
              </div>

              {dueSubscriptions.length === 0 ? (
                <EmptyPanel
                  title="No due subscriptions"
                  description="There are no active due collection items in the current dashboard payload."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="px-3 py-3 font-medium">Customer</th>
                        <th className="px-3 py-3 font-medium">Subscription</th>
                        <th className="px-3 py-3 font-medium">Product</th>
                        <th className="px-3 py-3 font-medium">Due Date</th>
                        <th className="px-3 py-3 font-medium">Amount</th>
                        <th className="px-3 py-3 font-medium">Overdue</th>
                        <th className="px-3 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dueSubscriptions.slice(0, 8).map((item) => {
                        const subscriptionId =
                          item.subscription_id ?? item.id ?? "";
                        const subscriptionLabel =
                          item.subscription_number ||
                          `SUB-${String(subscriptionId)}`;

                        return (
                          <tr
                            key={`${subscriptionId}-${item.due_date ?? "na"}`}
                            className="border-b border-border/70 align-top"
                          >
                            <td className="px-3 py-3">
                              <div className="font-medium text-foreground">
                                {item.customer_name || "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.customer_phone || "—"}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-medium text-foreground">
                                {subscriptionLabel}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Batch {item.batch_code || "—"} · Lucky{" "}
                                {item.lucky_number ?? "—"}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-foreground">
                              {item.product_name || "—"}
                            </td>
                            <td className="px-3 py-3 text-foreground">
                              {formatDate(item.due_date)}
                            </td>
                            <td className="px-3 py-3 font-medium text-foreground">
                              {money(
                                item.pending_amount ?? item.monthly_amount ?? 0
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                {item.overdue_days && item.overdue_days > 0
                                  ? `${item.overdue_days} days`
                                  : "Current"}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              <Link
                                href={`/partner/collections/create?subscription=${subscriptionId}`}
                                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                              >
                                Collect
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Recent Collection Requests
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Operational progress visible before admin financial
                    verification.
                  </p>
                </div>

                <Link
                  href="/partner/collections"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  View All
                </Link>
              </div>

              {recentCollectionRequests.length === 0 ? (
                <EmptyPanel
                  title="No recent requests"
                  description="No recent partner collection requests are currently visible."
                />
              ) : (
                <div className="space-y-3">
                  {recentCollectionRequests.slice(0, 6).map((item) => {
                    const subscriptionId = item.subscription_id ?? "na";

                    return (
                      <div
                        key={String(item.id)}
                        className="rounded-xl border border-border bg-background p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">
                              {item.customer_name || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.subscription_number ||
                                `SUB-${String(subscriptionId)}`}
                            </div>
                          </div>

                          <StatusBadge status={item.status} />
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Amount
                            </p>
                            <p className="font-medium text-foreground">
                              {money(item.amount ?? 0)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Method
                            </p>
                            <p className="font-medium text-foreground">
                              {item.method || "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Payment Date
                            </p>
                            <p className="font-medium text-foreground">
                              {formatDate(item.payment_date)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              Submitted
                            </p>
                            <p className="font-medium text-foreground">
                              {formatDateTime(item.submitted_at)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Ref: {item.reference_no || "—"}
                          </p>

                          <Link
                            href={`/partner/collections/${String(item.id)}`}
                            className="inline-flex items-center gap-2 text-sm font-medium text-primary transition hover:underline"
                          >
                            Open request
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Verified Payment Activity
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Only admin-verified payments should appear in financial
                    history.
                  </p>
                </div>

                <Link
                  href="/partner/payments"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Payments
                </Link>
              </div>

              {recentVerifiedPayments.length === 0 ? (
                <EmptyPanel
                  title="No verified payments yet"
                  description="No verified partner-visible payment rows are currently available."
                />
              ) : (
                <div className="space-y-3">
                  {recentVerifiedPayments.slice(0, 6).map((item) => (
                    <div
                      key={String(item.id)}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-background p-4"
                    >
                      <div>
                        <div className="font-medium text-foreground">
                          {item.customer_name || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.subscription_number ||
                            `SUB-${String(item.subscription_id ?? item.id)}`}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.method || "—"} · {formatDateTime(item.paid_at)}
                        </div>
                      </div>

                      <div className="text-right">
                        <StatusBadge status="VERIFIED" />
                        <p className="mt-2 font-semibold text-foreground">
                          {money(item.amount ?? 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-card-foreground">
                    Follow-up Queue
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Accounts that need partner attention due to overdue EMI or
                    request correction.
                  </p>
                </div>

                <Link
                  href="/partner/customers"
                  className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                >
                  Open Customers
                </Link>
              </div>

              {followUpQueue.length === 0 ? (
                <EmptyPanel
                  title="No follow-up items"
                  description="No overdue or collection rework items currently require partner action."
                />
              ) : (
                <div className="space-y-3">
                  {followUpQueue.slice(0, 6).map((item) => (
                    <div
                      key={String(item.id)}
                      className="rounded-xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">
                            {item.customer_name || "—"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.subscription_number ||
                              `SUB-${String(item.subscription_id ?? item.id)}`}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.customer_phone || "—"}
                          </p>
                        </div>

                        <div className="text-right text-sm">
                          <p className="font-medium text-foreground">
                            {money(item.pending_amount ?? 0)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.overdue_days && item.overdue_days > 0
                              ? `${item.overdue_days} overdue days`
                              : "Follow-up required"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        {item.reason || "Pending follow-up action required."}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-card-foreground">
                  Operational Actions
                </h3>
              </div>

              <div className="space-y-3">
                <Link
                  href="/partner/collections/create"
                  className="block rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                >
                  <p className="font-medium text-foreground">
                    Submit New Collection
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Record a field collection request for admin verification.
                  </p>
                </Link>

                <Link
                  href="/partner/collections"
                  className="block rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                >
                  <p className="font-medium text-foreground">
                    Track Request Status
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review submitted, under-review, approved, and rejected
                    requests.
                  </p>
                </Link>

                <Link
                  href="/partner/commissions"
                  className="block rounded-xl border border-border bg-background p-4 transition hover:bg-muted"
                >
                  <p className="font-medium text-foreground">
                    Monitor Commission
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Check pending and settled earning status.
                  </p>
                </Link>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </PortalPage>
  );
}
