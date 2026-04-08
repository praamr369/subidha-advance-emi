"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  RefreshCw,
  Users,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import StatCard from "@/components/ui/StatCard";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import { getPartnerDashboard } from "@/services/partner";

type DashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner dashboard.";
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

  const summary = data?.summary;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const winnerPosture = buildWinnerPosture(data?.winner_surface, summary);
  const reconciliationPosture = buildReconciliationPosture(data?.reconciliation);

  return (
    <PortalPage
      title="Partner Dashboard"
      subtitle="Partner-scoped collection truth aligned to the canonical subscription rollup, with separate operational visibility for request workflow and commission status."
      breadcrumbs={[{ label: "Partner" }]}
      actions={[
        {
          href: "/partner/collections/create",
          label: "Submit Collection",
          variant: "primary",
        },
        {
          href: "/partner/collections",
          label: "Collection Queue",
          variant: "secondary",
        },
        {
          href: "/partner/reports",
          label: "Reports",
          variant: "secondary",
        },
      ]}
      stats={
        data
          ? [
              {
                label: "Customers In Scope",
                value: String(data.summary.total_customers ?? 0),
                tone: "info",
              },
              {
                label: "Subscriptions",
                value: String(data.summary.total_subscriptions ?? 0),
              },
              {
                label: "Collected",
                value: money(data.summary.total_revenue_collected),
                tone: "success",
              },
              {
                label: "Pending Commission",
                value: money(data.summary.pending_commission),
                tone: "warning",
              },
            ]
          : []
      }
      statusBadge={{ label: "Partner Scope", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading partner dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner dashboard"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && data && summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Paid"
                value={money(summary.total_paid_amount ?? summary.total_revenue_collected)}
                subtext={`${summary.paid_emis} EMI already reflected in partner-visible settlement truth`}
                tone="success"
                icon={<CircleDollarSign className="h-5 w-5" />}
              />
              <StatCard
                label="Remaining"
                value={money(summary.remaining_amount ?? summary.outstanding_amount)}
                subtext={`${money(summary.total_pending_amount)} still open inside this partner scope`}
                tone={
                  Number(summary.remaining_amount ?? summary.outstanding_amount ?? 0) > 0
                    ? "info"
                    : "success"
                }
                icon={<CreditCard className="h-5 w-5" />}
              />
              <StatCard
                label="Overdue EMI"
                value={String(summary.overdue_emis ?? 0)}
                subtext={`${money(summary.overdue_amount)} currently overdue in partner scope`}
                tone={(summary.overdue_emis ?? 0) > 0 ? "warning" : "default"}
                icon={<AlertTriangle className="h-5 w-5" />}
              />
              <StatCard
                label="Upcoming EMI"
                value={String(summary.upcoming_emis ?? 0)}
                subtext={
                  summary.next_due_date && summary.next_due_amount
                    ? `${money(summary.next_due_amount)} next on ${formatDate(
                        summary.next_due_date
                      )}`
                    : "No next due row is currently visible"
                }
                tone="default"
                icon={<CalendarClock className="h-5 w-5" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <section
                className={`rounded-[1.8rem] border p-6 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.52)] ${settlementPosture?.tone}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Settlement posture
                    </p>
                    <h2 className="mt-3 text-xl font-semibold text-slate-950">
                      {settlementPosture?.title}
                    </h2>
                  </div>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${settlementPosture?.badgeClass}`}
                  >
                    {settlementPosture?.badgeLabel}
                  </span>
                </div>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-700">
                  {settlementPosture?.description}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Next due contract
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {summary.next_due_subscription_number || "No due contract"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {summary.next_due_date
                        ? `${money(summary.next_due_amount)} on ${formatDate(
                            summary.next_due_date
                          )}`
                        : "No pending EMI"}
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Collection pipeline
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {data.summary.under_review_collection_requests ?? 0} under review
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {data.summary.submitted_collection_requests ?? 0} submitted,{" "}
                      {data.summary.approved_collection_requests ?? 0} approved
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Commission posture
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {money(data.summary.pending_commission)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {money(data.summary.settled_commission)} already settled
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-4">
                <WorkspaceSection
                  title={winnerPosture.title}
                  description={winnerPosture.description}
                  className="h-full"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Winner subscriptions"
                      value={String(
                        data.winner_surface?.winner_subscriptions ??
                          summary.winner_subscriptions ??
                          0
                      )}
                      subtext={`${data.winner_surface?.waived_emis ?? summary.waived_emis ?? 0} waived EMI rows`}
                      tone="info"
                      icon={<BadgeCheck className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Waived value"
                      value={money(
                        data.winner_surface?.total_waived_amount ??
                          summary.total_waived_amount
                      )}
                      subtext={winnerPosture.badgeLabel}
                      tone="default"
                      icon={<Users className="h-5 w-5" />}
                    />
                  </div>
                </WorkspaceSection>

                <WorkspaceSection
                  title={reconciliationPosture.title}
                  description={reconciliationPosture.description}
                  className={reconciliationPosture.tone}
                  actionHref="/partner/reports"
                  actionLabel="Open reports"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Checked"
                      value={String(data.reconciliation?.checked_count ?? 0)}
                      subtext="Subscriptions checked in this partner scope"
                      tone="default"
                    />
                    <StatCard
                      label="Flagged"
                      value={String(data.reconciliation?.flagged_count ?? 0)}
                      subtext="Rows needing follow-up"
                      tone={
                        (data.reconciliation?.flagged_count ?? 0) > 0
                          ? "warning"
                          : "success"
                      }
                    />
                  </div>
                </WorkspaceSection>
              </div>
            </div>

            <WorkspaceSection
              title="Due collection queue"
              description="Partner-scoped next-due contracts ordered by urgency, sourced from the canonical subscription snapshot."
              actionHref="/partner/subscriptions"
              actionLabel="Open subscriptions"
            >
              {data.due_subscriptions && data.due_subscriptions.length > 0 ? (
                <div className="grid gap-3">
                  {data.due_subscriptions.slice(0, 8).map((item) => {
                    const subscriptionId = item.subscription_id ?? item.id;
                    return (
                      <div
                        key={`${subscriptionId}-${item.emi_id ?? "na"}`}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.subscription_number || `SUB-${String(subscriptionId)}`} ·{" "}
                              {item.product_name || "Linked product"} · Batch{" "}
                              {item.batch_code || "—"} · Lucky {item.lucky_number ?? "—"}
                            </div>
                            <div className="mt-2 text-sm text-muted-foreground">
                              Due {formatDate(item.due_date)} · Pending{" "}
                              {money(item.pending_amount)}
                              {item.is_overdue && item.overdue_days
                                ? ` · ${item.overdue_days} day(s) overdue`
                                : ""}
                            </div>
                          </div>
                          <Link
                            href={`/partner/collections/create?subscription=${String(subscriptionId)}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                          >
                            Collect
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No due subscriptions"
                  description="There are no current next-due rows inside this partner scope."
                />
              )}
            </WorkspaceSection>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Recent collection requests"
                description="Request workflow visibility stays operational only and does not redefine settlement truth."
                actionHref="/partner/collections"
                actionLabel="Open queue"
              >
                {data.recent_collection_requests &&
                data.recent_collection_requests.length > 0 ? (
                  <div className="grid gap-3">
                    {data.recent_collection_requests.slice(0, 6).map((item) => (
                      <div
                        key={String(item.id)}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.subscription_number || "Subscription pending"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.customer_name || "Unknown customer"} ·{" "}
                              {money(item.amount)}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                              {item.status || "SUBMITTED"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(item.payment_date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No recent requests"
                    description="No recent partner collection requests are currently visible."
                  />
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title="Recent verified payments"
                description="Verified payment rows remain partner-visible, but broader admin finance controls stay out of this dashboard."
                actionHref="/partner/payments"
                actionLabel="Open payments"
              >
                {data.recent_verified_payments &&
                data.recent_verified_payments.length > 0 ? (
                  <div className="grid gap-3">
                    {data.recent_verified_payments.slice(0, 6).map((item) => (
                      <div
                        key={String(item.id)}
                        className="rounded-2xl border border-white/75 bg-white/75 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {item.customer_name || "Unknown customer"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {item.subscription_number || "Subscription pending"} ·{" "}
                              {item.method || "—"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {money(item.amount)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(item.payment_date)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No verified payments"
                    description="No verified partner-visible payment rows are currently visible."
                  />
                )}
              </WorkspaceSection>
            </div>
          </>
        ) : null}

        {!loading && !error && !data ? (
          <EmptyState
            title="No partner dashboard data"
            description="Partner dashboard data is not currently available."
          />
        ) : null}
      </div>
    </PortalPage>
  );
}
