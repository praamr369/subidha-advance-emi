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
  Percent,
  RefreshCw,
  ShieldAlert,
  Wallet,
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
import {
  buildAdminBatchRoute,
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getAdminDashboard } from "@/services/admin";
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

type LegacyDashboardPayload = Awaited<ReturnType<typeof getAdminDashboard>>;
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
  return "Failed to load admin dashboard.";
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

export default function AdminDashboardPage() {
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

  async function loadDashboard(mode: "initial" | "refresh" = "initial") {
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
        winnerPayload,
      ] = await Promise.all([
        getAdminDashboard(),
        getDashboardSummaryV2(dashboardQuery),
        listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
        listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
        listDashboardRecentPayments({ ...dashboardQuery, limit: 8 }),
        listDashboardReconciliationExceptions({ ...dashboardQuery, limit: 4 }),
        listDashboardWinners({ ...dashboardQuery, limit: 4 }),
      ]);

      setLegacy(legacyPayload);
      setCanonical(canonicalPayload);
      setOverdue(overduePayload);
      setUpcoming(upcomingPayload);
      setRecentPayments(recentPaymentsPayload);
      setReconciliationItems(reconciliationPayload);
      setWinnerItems(winnerPayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setLegacy(null);
        setCanonical(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard("initial");
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
      title="Admin Dashboard"
      subtitle="Canonical finance truth for store operations, recovery pressure, waiver exposure, commission posture, and reconciliation attention without separate dashboard math per role."
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        {
          href: ROUTES.admin.collections,
          label: "Collections",
          variant: "primary",
        },
        {
          href: ROUTES.admin.subscriptions,
          label: "Subscriptions",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.financeCommissions,
          label: "Commissions",
          variant: "secondary",
        },
      ]}
      stats={
        legacy && summary
          ? [
              {
                label: "Customers",
                value: String(legacy.subscription_kpis?.total_customers ?? 0),
              },
              {
                label: "Active Contracts",
                value: String(summary.active_subscriptions ?? 0),
              },
              {
                label: "Collected Today",
                value: money(legacy.collections?.today_net_amount),
                tone: "success",
              },
              {
                label: "Flagged Reconciliation",
                value: String(reconciliationSurface?.flagged_count ?? 0),
                tone:
                  (reconciliationSurface?.flagged_count ?? 0) > 0
                    ? "warning"
                    : "info",
              },
            ]
          : []
      }
      statusBadge={{
        label: summary?.has_payment_adjustments
          ? "Canonical Finance + Adjustments"
          : "Canonical Finance",
        tone: summary?.has_payment_adjustments ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadDashboard("refresh")}
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

        {loading ? <LoadingBlock label="Loading admin dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load admin dashboard"
            description={error}
            onRetry={() => void loadDashboard("initial")}
          />
        ) : null}

        {!loading && !error && legacy && summary ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Paid"
                value={money(summary.total_paid_amount)}
                subtext={`${summary.paid_emis} EMI settled across the full admin scope`}
                tone="success"
                icon={<CircleDollarSign className="h-5 w-5" />}
              />
              <StatCard
                label="Remaining"
                value={money(summary.remaining_amount ?? summary.outstanding_amount)}
                subtext={`${money(summary.total_pending_amount)} still open across active contracts`}
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
                subtext={`${money(summary.overdue_amount)} currently overdue in canonical scope`}
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

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
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

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Next due contract
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {summary.next_due_subscription_number || "No pending EMI"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {summary.next_due_date
                        ? `${money(summary.next_due_amount)} on ${formatDate(
                            summary.next_due_date
                          )}`
                        : "No pending EMI visible"}
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Collections today
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {money(legacy.collections?.today_net_amount)}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.collections?.today_transaction_count ?? 0} transactions
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Contract footprint
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {legacy.subscription_kpis?.total_subscriptions ??
                        summary.subscription_count}{" "}
                      contracts
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.subscription_kpis?.total_customers ?? 0} customers in total
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Next draw
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {legacy.batches.next_draw_batch?.batch_code ?? "No live batch"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.batches.next_draw_batch?.draw_date
                        ? `${legacy.batches.next_draw_batch.days_until_draw ?? 0} days to ${formatDate(
                            legacy.batches.next_draw_batch.draw_date
                          )}`
                        : "No draw currently scheduled"}
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
                            {row.draw_revealed_at
                              ? ` • Revealed ${formatDate(row.draw_revealed_at)}`
                              : ""}
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
                        href={buildAdminReconciliationRoute({ flagged: true })}
                        variant="secondary"
                        className="h-9 px-3 text-xs"
                      >
                        Open reconciliation
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
                      subtext="Subscriptions checked in admin scope"
                      tone="default"
                    />
                    <StatCard
                      label="Flagged"
                      value={String(reconciliationSurface?.flagged_count ?? 0)}
                      subtext="Rows needing controlled finance review"
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

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Collections and commissions"
                description="Operational collection throughput stays separate from partner commission settlement, but all shared finance posture now comes from the same canonical summary-v2 flow."
                actionHref={ROUTES.admin.financeCommissions}
                actionLabel="Open commission finance"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard
                    label="Gross Today"
                    value={money(legacy.collections?.today_gross_amount)}
                    subtext={`${legacy.collections?.today_active_payments ?? 0} active payment rows`}
                    tone="default"
                    icon={<Wallet className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Net Today"
                    value={money(legacy.collections?.today_net_amount)}
                    subtext={`${legacy.collections?.today_reversed_payments ?? 0} reversed rows excluded`}
                    tone="success"
                    icon={<CircleDollarSign className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Pending Commission"
                    value={money(legacy.commission_summary?.pending_commission)}
                    subtext={`${legacy.commission_summary?.pending_count ?? 0} rows waiting settlement`}
                    tone="warning"
                    icon={<Percent className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Defaulted"
                    value={String(legacy.risk.defaulted)}
                    subtext={`${legacy.risk.default_rate.toFixed(2)}% default rate`}
                    tone={legacy.risk.defaulted > 0 ? "warning" : "success"}
                    icon={<ShieldAlert className="h-5 w-5" />}
                  />
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Due collection queue"
                description="Canonical next-due subscription rows, ordered by urgency for the selected drilldown window."
                action={
                  <>
                    <ActionButton
                      href={ROUTES.admin.subscriptions}
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
                    {dueRows.map((row) => (
                      <div
                        key={`${row.subscription_id ?? row.id}-${row.emi_id ?? "na"}`}
                        className="grid gap-3 rounded-[1.4rem] border border-white/80 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={buildAdminSubscriptionRoute(
                                row.subscription_id ?? row.id
                              )}
                              className="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
                            >
                              {row.subscription_number ||
                                `Subscription ${row.subscription_id ?? row.id}`}
                            </Link>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                row.is_overdue
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}
                            >
                              {row.is_overdue
                                ? `${row.overdue_days ?? 0} days overdue`
                                : "Upcoming"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {row.customer_name || "Unknown customer"}
                            {row.product_name ? ` • ${row.product_name}` : ""}
                            {row.batch_code ? ` • Batch ${row.batch_code}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Due {formatDate(row.due_date)}
                          </p>
                        </div>

                        <div className="grid gap-2 text-sm text-slate-700">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Monthly amount
                            </div>
                            <div className="mt-1 font-semibold text-slate-950">
                              {money(row.monthly_amount)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Pending amount
                            </div>
                            <div className="mt-1 font-semibold text-slate-950">
                              {money(row.pending_amount)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center md:justify-end">
                          <Link
                            href={buildAdminSubscriptionRoute(row.subscription_id ?? row.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-50"
                          >
                            Open
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No contracts are waiting in the due queue"
                    description="The selected drilldown window is not currently returning any upcoming or overdue rows."
                  />
                )}
              </WorkspaceSection>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <WorkspaceSection
                title="Recent payment activity"
                description="Latest admin-visible payment rows from the Phase-2 canonical drilldown surface."
                action={
                  <>
                    <ActionButton
                      href={ROUTES.admin.payments}
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
                    {paymentRows.map((row) => (
                      <div
                        key={row.payment_id}
                        className="grid gap-3 rounded-[1.4rem] border border-white/80 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={buildAdminPaymentRoute(row.payment_id)}
                              className="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
                            >
                              Payment #{row.payment_id}
                            </Link>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                row.is_reversed
                                  ? "border-red-200 bg-red-50 text-red-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {row.is_reversed ? "Reversed" : "Active"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-700">
                            {row.customer_name || "Unknown customer"}
                            {row.subscription_number ? ` • ${row.subscription_number}` : ""}
                            {row.batch_code ? ` • Batch ${row.batch_code}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTime(row.payment_date || row.created_at)}
                            {row.method ? ` • ${row.method}` : ""}
                            {row.reference_no ? ` • Ref ${row.reference_no}` : ""}
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-700">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Amount
                            </div>
                            <div className="mt-1 font-semibold text-slate-950">
                              {money(row.amount)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Lucky ID
                            </div>
                            <div className="mt-1 font-semibold text-slate-950">
                              {row.lucky_number ?? "—"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center md:justify-end">
                          <Link
                            href={buildAdminPaymentRoute(row.payment_id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/80 bg-white px-3.5 py-2 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-50"
                          >
                            View
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No payment activity in the current window"
                    description="No recent payment rows are visible for the selected drilldown window."
                  />
                )}
              </WorkspaceSection>

              <WorkspaceSection
                title="Reconciliation attention"
                description="Top flagged subscriptions surfaced from the canonical reconciliation lane for the selected drilldown window."
                actionHref={buildAdminReconciliationRoute({ flagged: true })}
                actionLabel="Open flagged rows"
              >
                {flaggedRows.length > 0 ? (
                  <div className="grid gap-3">
                    {flaggedRows.map((row) => (
                      <div
                        key={row.subscription_id}
                        className="rounded-[1.4rem] border border-white/80 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <Link
                              href={buildAdminSubscriptionRoute(row.subscription_id)}
                              className="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
                            >
                              {row.subscription_number}
                            </Link>
                            <p className="mt-1 text-sm text-slate-700">
                              {row.customer_name || "Unknown customer"}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              Delta
                            </div>
                            <div className="mt-1 text-sm font-semibold text-amber-700">
                              {money(row.delta)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-3">
                          <StatCard
                            label="Recorded pending"
                            value={money(row.pending_outstanding)}
                            tone="default"
                            className="rounded-[1.2rem] p-4"
                          />
                          <StatCard
                            label="Computed pending"
                            value={money(row.computed_outstanding)}
                            tone="warning"
                            className="rounded-[1.2rem] p-4"
                          />
                          <StatCard
                            label="Paid + waived"
                            value={`${money(row.paid_amount)} / ${money(row.waived_amount)}`}
                            tone="info"
                            className="rounded-[1.2rem] p-4"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No flagged reconciliation rows"
                    description="The current canonical reconciliation pass is balanced for the rows it checked."
                  />
                )}
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Control actions"
              description="Administrative drill-down routes that preserve the existing operating model while the shared finance surfaces now come from the canonical summary-v2 and surface endpoints."
              contentClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            >
              <Link
                href={ROUTES.admin.collections}
                className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
              >
                Open collections
              </Link>
              <Link
                href={buildAdminReconciliationRoute({ flagged: true })}
                className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
              >
                Review flagged reconciliation
              </Link>
              <Link
                href={
                  legacy.batches.next_draw_batch
                    ? buildAdminBatchRoute(legacy.batches.next_draw_batch.id)
                    : ROUTES.admin.batches
                }
                className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
              >
                Open next draw batch
              </Link>
              <Link
                href={ROUTES.admin.financeCommissions}
                className="rounded-[1.3rem] border border-white/75 bg-white/75 px-4 py-4 text-sm font-medium text-slate-900 transition hover:-translate-y-0.5 hover:bg-white"
              >
                Open commission finance
              </Link>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
