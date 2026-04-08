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

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardSurfaceExportActions from "@/components/dashboard/DashboardSurfaceExportActions";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
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
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardReconciliationExceptions,
  listDashboardUpcoming,
  listDashboardWinners,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import type { DashboardWindowPreset } from "@/services/dashboard-types";

type LegacyDashboardPayload = Awaited<ReturnType<typeof getPartnerDashboard>>;
type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DashboardDuePayload = Awaited<ReturnType<typeof listDashboardOverdue>>;
type DashboardPaymentsPayload = Awaited<
  ReturnType<typeof listDashboardRecentPayments>
>;
type DashboardReconciliationPayload = Awaited<
  ReturnType<typeof listDashboardReconciliationExceptions>
>;
type DashboardWinnersPayload = Awaited<ReturnType<typeof listDashboardWinners>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load partner dashboard.";
}

export default function PartnerDashboardPage() {
  const [legacy, setLegacy] = useState<LegacyDashboardPayload | null>(null);
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [upcoming, setUpcoming] = useState<DashboardDuePayload | null>(null);
  const [overdue, setOverdue] = useState<DashboardDuePayload | null>(null);
  const [recentPayments, setRecentPayments] =
    useState<DashboardPaymentsPayload | null>(null);
  const [reconciliationItems, setReconciliationItems] =
    useState<DashboardReconciliationPayload | null>(null);
  const [winnerItems, setWinnerItems] = useState<DashboardWinnersPayload | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("DEFAULT");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dashboardQuery =
    windowPreset === "CUSTOM"
      ? {
          window: windowPreset,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }
      : { window: windowPreset };

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [
        legacyPayload,
        canonicalPayload,
        overduePayload,
        upcomingPayload,
        recentPaymentsPayload,
        reconciliationPayload,
        winnersPayload,
      ] = await Promise.all([
        getPartnerDashboard(),
        getDashboardSummaryV2(dashboardQuery),
        listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
        listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
        listDashboardRecentPayments({ ...dashboardQuery, limit: 6 }),
        listDashboardReconciliationExceptions({ ...dashboardQuery, limit: 4 }),
        listDashboardWinners({ ...dashboardQuery, limit: 4 }),
      ]);

      setLegacy(legacyPayload);
      setCanonical(canonicalPayload);
      setOverdue(overduePayload);
      setUpcoming(upcomingPayload);
      setRecentPayments(recentPaymentsPayload);
      setReconciliationItems(reconciliationPayload);
      setWinnerItems(winnersPayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setLegacy(null);
      setCanonical(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, [windowPreset, startDate, endDate]);

  const summary =
    canonical?.summary ??
    (legacy?.summary
      ? normalizeDashboardSummary(
          legacy.summary as unknown as Record<string, unknown>
        )
      : undefined);
  const winnerSurface = canonical?.winner_surface ?? legacy?.winner_surface;
  const reconciliationSurface =
    canonical?.reconciliation ?? legacy?.reconciliation;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const winnerPosture = buildWinnerPosture(winnerSurface, summary);
  const reconciliationPosture = buildReconciliationPosture(
    reconciliationSurface
  );
  const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
    0,
    8
  );
  const paymentRows = recentPayments?.results ?? [];
  const flaggedRows = reconciliationItems?.results ?? [];
  const winnerRows = winnerItems?.results ?? [];

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
        legacy
          ? [
              {
                label: "Customers In Scope",
                value: String(legacy.summary.total_customers ?? 0),
                tone: "info",
              },
              {
                label: "Subscriptions",
                value: String(legacy.summary.total_subscriptions ?? 0),
              },
              {
                label: "Collected",
                value: money(legacy.summary.total_revenue_collected),
                tone: "success",
              },
              {
                label: "Pending Commission",
                value: money(legacy.summary.pending_commission),
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

        <DashboardTimeWindowSelector
          value={windowPreset}
          startDate={startDate}
          endDate={endDate}
          loading={loading || refreshing}
          onWindowChange={setWindowPreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />

        {loading ? <LoadingBlock label="Loading partner dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load partner dashboard"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && legacy && summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Paid"
                value={money(summary.total_paid_amount)}
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
                      {legacy.summary.under_review_collection_requests ?? 0} under review
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.summary.submitted_collection_requests ?? 0} submitted,{" "}
                      {legacy.summary.approved_collection_requests ?? 0} approved
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Commission posture
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {money(legacy.summary.pending_commission)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {money(legacy.summary.settled_commission)} already settled
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-4">
                <WorkspaceSection
                  title={winnerPosture.title}
                  description={winnerPosture.description}
                  className="h-full"
                  action={
                    <DashboardSurfaceExportActions
                      query={dashboardQuery}
                      actions={[{ surface: "winners", label: "Export CSV" }]}
                    />
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Winner subscriptions"
                      value={String(
                        winnerSurface?.winner_subscriptions ??
                          summary.winner_subscriptions ??
                          0
                      )}
                      subtext={`${winnerSurface?.waived_emis ?? summary.waived_emis ?? 0} waived EMI rows`}
                      tone="info"
                      icon={<BadgeCheck className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Waived value"
                      value={money(
                        winnerSurface?.total_waived_amount ??
                          summary.total_waived_amount
                      )}
                      subtext={winnerPosture.badgeLabel}
                      tone="default"
                      icon={<Users className="h-5 w-5" />}
                    />
                  </div>
                  {winnerRows.length > 0 ? (
                    <div className="mt-4 grid gap-2">
                      {winnerRows.map((row) => (
                        <div
                          key={row.subscription_id}
                          className="rounded-[1.2rem] border border-white/80 bg-white/80 px-4 py-3 text-sm text-slate-700"
                        >
                          <div className="font-semibold text-slate-950">
                            {row.subscription_number}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {row.customer_name || "Unknown customer"}
                            {row.waived_amount
                              ? ` • Waived ${money(row.waived_amount)}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </WorkspaceSection>

                <WorkspaceSection
                  title={reconciliationPosture.title}
                  description={reconciliationPosture.description}
                  className={reconciliationPosture.tone}
                  action={
                    <>
                      <ActionButton
                        href="/partner/reports"
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                      >
                        Open reports
                      </ActionButton>
                      <DashboardSurfaceExportActions
                        query={dashboardQuery}
                        actions={[
                          {
                            surface: "reconciliation-exceptions",
                            label: "Export CSV",
                          },
                        ]}
                      />
                    </>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Checked"
                      value={String(reconciliationSurface?.checked_count ?? 0)}
                      subtext="Subscriptions checked in this partner scope"
                      tone="default"
                    />
                    <StatCard
                      label="Flagged"
                      value={String(reconciliationSurface?.flagged_count ?? 0)}
                      subtext="Rows needing follow-up"
                      tone={
                        (reconciliationSurface?.flagged_count ?? 0) > 0
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
              description="Partner-scoped next-due contracts ordered by urgency, sourced from the canonical surface endpoints."
              action={
                <>
                  <ActionButton
                    href="/partner/subscriptions"
                    variant="secondary"
                    className="h-9 px-3 text-xs"
                  >
                    Open subscriptions
                  </ActionButton>
                  <DashboardSurfaceExportActions
                    query={dashboardQuery}
                    actions={[
                      { surface: "upcoming", label: "Export upcoming" },
                      { surface: "overdue", label: "Export overdue" },
                    ]}
                  />
                </>
              }
            >
              {dueRows.length > 0 ? (
                <div className="grid gap-3">
                  {dueRows.map((item) => {
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
                {legacy.recent_collection_requests &&
                legacy.recent_collection_requests.length > 0 ? (
                  <div className="grid gap-3">
                    {legacy.recent_collection_requests.slice(0, 6).map((item) => (
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
                description="Verified payment rows now come from the shared canonical recent-payments surface while broader admin finance controls stay out of this dashboard."
                action={
                  <>
                    <ActionButton
                      href="/partner/payments"
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                    >
                      Open payments
                    </ActionButton>
                    <DashboardSurfaceExportActions
                      query={dashboardQuery}
                      actions={[
                        {
                          surface: "recent-payments",
                          label: "Export CSV",
                        },
                      ]}
                    />
                  </>
                }
              >
                {paymentRows.length > 0 ? (
                  <div className="grid gap-3">
                    {paymentRows.map((item) => (
                      <div
                        key={item.payment_id}
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
      </div>
    </PortalPage>
  );
}
