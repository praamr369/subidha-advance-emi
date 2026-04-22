"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingUp } from "lucide-react";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminReconciliationRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  getAdminAnalyticsSummary,
  type AdminAnalyticsSummaryResponse,
} from "@/services/reports";
import type { DashboardWindowPreset } from "@/services/dashboard-types";

function money(value: string | number | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load reports overview.";
}

function resolveWindowLabel(
  preset: DashboardWindowPreset,
  startDate: string,
  endDate: string
): string {
  if (preset === "CUSTOM") {
    if (startDate && endDate) return `${startDate} -> ${endDate}`;
    return "Custom range";
  }
  if (preset === "THIS_MONTH") return "This month";
  if (preset === "LAST_30_DAYS") return "Last 30 days";
  return "Default view";
}

function MiniBar({
  label,
  value,
  total,
  amount,
}: {
  label: string;
  value: number;
  total: number;
  amount?: string;
}) {
  const width = percent(value, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{amount ?? String(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function PurposeChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function AdminReportsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummaryResponse | null>(null);
  const [windowPreset, setWindowPreset] = useState<DashboardWindowPreset>("THIS_MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyticsQuery = useMemo(
    () =>
      windowPreset === "CUSTOM"
        ? {
            window: windowPreset,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          }
        : {
            window: windowPreset,
          },
    [endDate, startDate, windowPreset]
  );

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const payload = await getAdminAnalyticsSummary(analyticsQuery);
        setAnalytics(payload);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setAnalytics(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [analyticsQuery]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const cards = useMemo(() => {
    const overview = analytics?.overview;
    return [
      {
        label: "Window Net Collections",
        value: money(overview?.window_net_collections),
        subtext: `${overview?.window_active_collection_count ?? 0} active rows`,
        tone: "success" as const,
      },
      {
        label: "Outstanding Receivables",
        value: money(overview?.outstanding_amount),
        subtext: "Canonical outstanding posture",
        tone: "warning" as const,
      },
      {
        label: "Overdue EMIs",
        value: String(overview?.overdue_emi_count ?? 0),
        subtext: money(overview?.overdue_emi_amount),
        tone: (overview?.overdue_emi_count ?? 0) > 0 ? ("danger" as const) : undefined,
      },
      {
        label: "Reconciliation Flags",
        value: String(overview?.reconciliation_flagged_count ?? 0),
        subtext: "Subscription-level mismatch signals",
        tone:
          (overview?.reconciliation_flagged_count ?? 0) > 0
            ? ("warning" as const)
            : undefined,
      },
      {
        label: "Delivery Actions",
        value: String(overview?.delivery_action_count ?? 0),
        subtext: "Pending + scheduled + in-transit",
      },
      {
        label: "Pending Commission",
        value: money(overview?.pending_commission_amount),
        subtext: `${overview?.pending_commission_count ?? 0} rows`,
        tone:
          (overview?.pending_commission_count ?? 0) > 0
            ? ("warning" as const)
            : undefined,
      },
    ];
  }, [analytics]);

  const quickLinks = [
    {
      title: "Revenue Report",
      description: "Collections mix and payment drill-down from register-backed rows.",
      href: "/admin/reports/revenue",
      badge: "PAID",
    },
    {
      title: "Overdue EMI Report",
      description: "Aging exposure and overdue follow-up depth for daily collections.",
      href: "/admin/reports/overdue",
      badge: "OVERDUE",
    },
    {
      title: "Batch Performance",
      description: "Subscription and winner progression by batch with draw context.",
      href: "/admin/reports/batch-performance",
      badge: "BATCH",
    },
    {
      title: "Collections Workspace",
      description: "Route to collection execution and row-level payment follow-up.",
      href: ROUTES.admin.collections,
      badge: "ACTION",
    },
    {
      title: "Reconciliation Workspace",
      description: "Investigate flagged subscription finance deltas before close.",
      href: buildAdminReconciliationRoute({ flagged: true }),
      badge: "UNDER_REVIEW",
    },
    {
      title: "Finance Control",
      description: "Commission, payout, accounts, and finance exception execution.",
      href: ROUTES.admin.finance,
      badge: "FINANCE",
    },
  ];

  const trendPoints = analytics?.collections_trend.points ?? [];
  const recentTrend = trendPoints.slice(-10);
  const trendMax = recentTrend.reduce(
    (max, point) => Math.max(max, toNumber(point.net_amount)),
    0
  );

  const methodRows = analytics?.payment_method_mix.rows ?? [];
  const methodTotal = methodRows.reduce((sum, row) => sum + toNumber(row.net_amount), 0);

  const receivableAging = analytics?.receivables_pressure.aging ?? [];
  const receivableAgingMax = receivableAging.reduce(
    (max, row) => Math.max(max, toNumber(row.amount)),
    0
  );

  const planMix = analytics?.subscription_mix.plan_type ?? [];
  const planTotal = planMix.reduce((sum, row) => sum + toNumber(row.count), 0);

  const batchMix = analytics?.subscription_mix.batch_mix ?? [];
  const batchMixMax = batchMix.reduce(
    (max, row) => Math.max(max, toNumber(row.monthly_booked_value)),
    0
  );

  const reconciliationRows = analytics?.reconciliation_posture.results ?? [];
  const deliverySummary = analytics?.delivery_posture.summary ?? {};
  const directSalesTrend = analytics?.direct_sales_posture.trend ?? [];
  const directSalesTrendMax = directSalesTrend.reduce(
    (max, row) => Math.max(max, toNumber(row.gross_total)),
    0
  );

  const financePosture = analytics?.finance_posture;

  return (
    <PortalPage
      title="Reports Overview"
      subtitle="Backend-prepared operational analytics for collections, receivables pressure, reconciliation posture, delivery readiness, and finance routing."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports" },
      ]}
      actions={[
        {
          href: buildAdminReconciliationRoute({ flagged: true }),
          label: "Open Reconciliation",
          variant: "secondary",
        },
        { href: "/admin/reports/revenue", label: "Open Revenue", variant: "primary" },
      ]}
      stats={[
        {
          label: "Collections",
          value: money(analytics?.overview.window_net_collections),
          tone: "success",
        },
        {
          label: "Overdue EMIs",
          value: String(analytics?.overview.overdue_emi_count ?? 0),
          tone: "warning",
        },
        {
          label: "Reconciliation Flags",
          value: String(analytics?.overview.reconciliation_flagged_count ?? 0),
          tone:
            (analytics?.overview.reconciliation_flagged_count ?? 0) > 0
              ? "warning"
              : undefined,
        },
        {
          label: "Window",
          value: resolveWindowLabel(windowPreset, startDate, endDate),
        },
      ]}
      statusBadge={{ label: "Backend Analytics", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Reporting workflow"
          description="Reports overview now consumes one admin analytics summary endpoint to keep chart calculations backend-driven and audit-aligned."
          action={
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        >
          <DashboardTimeWindowSelector
            value={windowPreset}
            startDate={startDate}
            endDate={endDate}
            loading={refreshing || loading}
            title="Reports window"
            description="Window filters apply to backend analytics trend slices and exception posture only; payment and settlement posting semantics remain unchanged."
            onWindowChange={setWindowPreset}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                subtext={card.subtext}
                tone={card.tone}
                icon={
                  card.label === "Reconciliation Flags" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )
                }
              />
            ))}
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading reports overview..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load reports overview"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <ControlLaneGrid
              title="Report lanes"
              description="Move from aggregate analytics into explicit operational workspaces. Reporting remains separate from finance posting, collections, and reconciliation execution."
              lanes={[
                {
                  title: "Analytics overview",
                  description: "Live dashboard-backed aggregate posture for admin leadership review.",
                  href: ROUTES.admin.analytics,
                  icon: <TrendingUp className="h-4 w-4" />,
                  badge: "View",
                },
                {
                  title: "Reconciliation workspace",
                  description: "Investigate flagged subscriptions and finance deltas before period close.",
                  href: buildAdminReconciliationRoute({ flagged: true }),
                  icon: <AlertTriangle className="h-4 w-4" />,
                  badge: "Risk",
                },
                {
                  title: "Branch reporting",
                  description: "Open branch-aware collections, sales, and people-cost reporting.",
                  href: ROUTES.admin.branchReporting,
                  badge: "Branch",
                },
                {
                  title: "Finance control",
                  description: "Receivables, payables, and account posture stay in a separate finance lane.",
                  href: ROUTES.admin.finance,
                  badge: "Finance",
                },
              ]}
            />
            <WorkspaceSection
              title="Report shortcuts"
              description="Launch live reporting and action surfaces without dead-end placeholders."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                      <StatusBadge status={item.badge} />
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      Open surface
                    </div>
                  </Link>
                ))}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Collections, receivables, and payment mix"
              description="Trend and pressure charts are prepared by backend aggregations for the active window."
              note={`Reference date ${analytics?.receivables_pressure.reference_date || "—"}`}
              noteTone="info"
            >
              <div className="grid gap-4 xl:grid-cols-3">
                <PurposeChartCard
                  title="Collections Trend"
                  description="Daily gross, reversed, and net collection posture for the selected window."
                >
                  {recentTrend.length === 0 ? (
                    <EmptyState
                      title="No collection trend rows"
                      description="No payment records are visible for the selected reporting window."
                    />
                  ) : (
                    <div className="space-y-4">
                      {recentTrend.map((point) => (
                        <MiniBar
                          key={`${point.date || "na"}-${point.count}`}
                          label={point.date || "Unknown date"}
                          value={toNumber(point.net_amount)}
                          total={Math.max(trendMax, 1)}
                          amount={`${money(point.net_amount)} · ${point.active_count} active`}
                        />
                      ))}
                    </div>
                  )}
                </PurposeChartCard>

                <PurposeChartCard
                  title="Receivables Aging"
                  description="Pending and overdue pressure buckets from backend snapshot reconciliation-safe rows."
                >
                  {receivableAging.length === 0 ? (
                    <EmptyState
                      title="No receivable buckets"
                      description="No pending EMI rows are available for aging distribution right now."
                    />
                  ) : (
                    <div className="space-y-4">
                      {receivableAging.map((row) => (
                        <MiniBar
                          key={row.bucket}
                          label={row.label}
                          value={toNumber(row.amount)}
                          total={Math.max(receivableAgingMax, 1)}
                          amount={`${money(row.amount)} · ${row.count}`}
                        />
                      ))}
                    </div>
                  )}
                </PurposeChartCard>

                <PurposeChartCard
                  title="Payment Method Mix"
                  description="Method-wise net collections with reversed row visibility retained in backend totals."
                >
                  {methodRows.length === 0 ? (
                    <EmptyState
                      title="No method split"
                      description="No payment method mix is available for the selected window."
                    />
                  ) : (
                    <div className="space-y-4">
                      {methodRows.map((row) => (
                        <MiniBar
                          key={row.method}
                          label={row.method}
                          value={toNumber(row.net_amount)}
                          total={Math.max(methodTotal, 1)}
                          amount={`${money(row.net_amount)} · ${row.active_count} active`}
                        />
                      ))}
                    </div>
                  )}
                </PurposeChartCard>
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Portfolio and exception posture"
              description="Subscription mix, reconciliation pressure, delivery posture, and direct-sale trend from backend data slices."
            >
              <div className="grid gap-4 xl:grid-cols-3">
                <PurposeChartCard
                  title="Subscription and Batch Mix"
                  description="Plan distribution and top batches by monthly booked value."
                >
                  <div className="space-y-4">
                    {planMix.length === 0 ? (
                      <EmptyState
                        title="No plan mix rows"
                        description="No subscriptions are currently available for plan distribution."
                      />
                    ) : (
                      planMix.map((row) => (
                        <MiniBar
                          key={row.plan_type}
                          label={row.plan_type}
                          value={row.count}
                          total={Math.max(planTotal, 1)}
                          amount={`${row.count} contracts`}
                        />
                      ))
                    )}
                    {batchMix.length === 0 ? null : (
                      <div className="border-t border-border pt-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Top batch mix
                        </div>
                        <div className="space-y-3">
                          {batchMix.slice(0, 5).map((row) => (
                            <MiniBar
                              key={String(row.batch_id)}
                              label={row.batch_code}
                              value={toNumber(row.monthly_booked_value)}
                              total={Math.max(batchMixMax, 1)}
                              amount={`${money(row.monthly_booked_value)} · ${row.subscription_count} subs`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </PurposeChartCard>

                <PurposeChartCard
                  title="Reconciliation Posture"
                  description="Flagged rows requiring controlled review before finance close and payout progression."
                >
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                      <div className="font-semibold text-foreground">
                        {analytics?.reconciliation_posture.flagged_count ?? 0} flagged / {analytics?.reconciliation_posture.checked_count ?? 0} checked
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Flag ratio {analytics?.reconciliation_posture.flagged_ratio ?? 0}%
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {analytics?.reconciliation_posture.note ||
                          "Use reconciliation workspace for row-level follow-up."}
                      </div>
                    </div>
                    {reconciliationRows.length === 0 ? (
                      <EmptyState
                        title="No flagged reconciliation rows"
                        description="No mismatch rows were returned for the selected scope."
                      />
                    ) : (
                      <div className="space-y-2">
                        {reconciliationRows.slice(0, 4).map((row) => (
                          <Link
                            key={row.subscription_id}
                            href={buildAdminReconciliationRoute({
                              subscription: row.subscription_id,
                              flagged: true,
                            })}
                            className="block rounded-xl border border-border bg-card px-3 py-2 text-sm transition hover:bg-muted"
                          >
                            <div className="font-medium text-foreground">{row.subscription_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {row.customer_name || "Unknown customer"} · Delta {money(row.delta)}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </PurposeChartCard>

                <PurposeChartCard
                  title="Delivery and Direct Sales"
                  description="Fulfillment pressure plus direct-sale trend for the selected window."
                >
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <div>Pending: {toNumber((deliverySummary as Record<string, unknown>).pending)}</div>
                      <div>Scheduled: {toNumber((deliverySummary as Record<string, unknown>).scheduled)}</div>
                      <div>In transit: {toNumber((deliverySummary as Record<string, unknown>).in_transit)}</div>
                      <div>Delivered: {toNumber((deliverySummary as Record<string, unknown>).delivered)}</div>
                    </div>
                    {directSalesTrend.length === 0 ? (
                      <EmptyState
                        title="No direct-sale trend rows"
                        description="No non-cancelled direct-sale records are visible in the selected window."
                      />
                    ) : (
                      <div className="space-y-3">
                        {directSalesTrend.slice(-5).map((row) => (
                          <MiniBar
                            key={`${row.date || "na"}-${row.count}`}
                            label={row.date || "Unknown date"}
                            value={toNumber(row.gross_total)}
                            total={Math.max(directSalesTrendMax, 1)}
                            amount={`${money(row.gross_total)} · ${row.count} docs`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </PurposeChartCard>
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Finance posture"
              description="Workflow-facing finance posture from backend-prepared commission, payout, account-master, and procurement signals."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Chart of Accounts"
                  value={String(financePosture?.chart_of_accounts_count ?? 0)}
                  subtext={`${financePosture?.finance_accounts_count ?? 0} finance accounts`}
                  href={ROUTES.admin.accountingChartOfAccounts}
                />
                <StatCard
                  label="Purchase Obligations"
                  value={String(financePosture?.purchase_obligations.draft_count ?? 0)}
                  subtext={`${financePosture?.purchase_obligations.approved_count ?? 0} approved`}
                  tone={
                    (financePosture?.purchase_obligations.draft_count ?? 0) > 0 ||
                    (financePosture?.purchase_obligations.approved_count ?? 0) > 0
                      ? "warning"
                      : undefined
                  }
                  href={ROUTES.admin.accountingPurchaseBills}
                />
                <StatCard
                  label="Pending Commission"
                  value={money(financePosture?.commission_summary.pending_amount)}
                  subtext={`${financePosture?.commission_summary.pending_count ?? 0} rows`}
                  tone={
                    (financePosture?.commission_summary.pending_count ?? 0) > 0
                      ? "warning"
                      : undefined
                  }
                  href={ROUTES.admin.financeCommissions}
                />
                <StatCard
                  label="Payout Draft Batches"
                  value={String(financePosture?.payout_batches.draft_count ?? 0)}
                  subtext={`${financePosture?.payout_batches.total_count ?? 0} total batches`}
                  href={ROUTES.admin.financePayoutBatches}
                />
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
