"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

import { listAdminLeads } from "@/services/admin-leads";
import { listAdminSupportRequests } from "@/services/admin-support-requests";
import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardSurfaceExportActions from "@/components/dashboard/DashboardSurfaceExportActions";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import StatCard from "@/components/ui/StatCard";
import PortalPage from "@/components/ui/PortalPage";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ADMIN_ENTERPRISE_MODULES } from "@/config/admin-enterprise";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import {
  buildAdminCollectionsRoute,
  buildAdminDeliveriesRoute,
  buildAdminLeadsRoute,
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRequestsRoute,
  buildAdminSubscriptionRoute,
  buildAdminSupportRequestsRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getAdminDashboard } from "@/services/admin";
import { getAdminDeliverySummary } from "@/services/deliveries";
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
import { listSubscriptionRequests } from "@/services/subscription-requests";

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
type DeliverySummaryPayload = Awaited<ReturnType<typeof getAdminDeliverySummary>>;
type SupportQueuePayload = Awaited<ReturnType<typeof listAdminSupportRequests>>;
type LeadQueuePayload = Awaited<ReturnType<typeof listAdminLeads>>;
type RequestQueuePayload = Awaited<ReturnType<typeof listSubscriptionRequests>>;

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

function ActionBucketCard({
  eyebrow,
  title,
  value,
  detail,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone?: "default" | "warning" | "success" | "info";
}) {
  const toneClassName =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/80"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50/80"
      : tone === "info"
      ? "border-sky-200 bg-sky-50/80"
      : "border-white/75 bg-white/80";

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.52)] ${toneClassName}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {eyebrow}
      </div>
      <h3 className="mt-2 text-base font-semibold text-slate-950">{title}</h3>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{detail}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <ActionButton href={primaryHref} variant="primary" className="h-9 px-3 text-xs">
          {primaryLabel}
        </ActionButton>
        {secondaryHref && secondaryLabel ? (
          <ActionButton
            href={secondaryHref}
            variant="secondary"
            className="h-9 px-3 text-xs"
          >
            {secondaryLabel}
          </ActionButton>
        ) : null}
      </div>
    </article>
  );
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
  const [deliverySummary, setDeliverySummary] =
    useState<DeliverySummaryPayload | null>(null);
  const [supportQueue, setSupportQueue] = useState<SupportQueuePayload | null>(null);
  const [leadQueue, setLeadQueue] = useState<LeadQueuePayload | null>(null);
  const [requestQueue, setRequestQueue] = useState<RequestQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("DEFAULT");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const dashboardQuery = useMemo(
    () =>
      windowPreset === "CUSTOM"
        ? {
            window: windowPreset,
            start_date: startDate || undefined,
            end_date: endDate || undefined,
          }
        : { window: windowPreset },
    [endDate, startDate, windowPreset]
  );

  const loadDashboard = useCallback(async (mode: "initial" | "refresh" = "initial") => {
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
        deliverySummaryPayload,
        supportQueuePayload,
        leadQueuePayload,
        requestQueuePayload,
      ] = await Promise.all([
        getAdminDashboard(),
        getDashboardSummaryV2(dashboardQuery),
        listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
        listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
        listDashboardRecentPayments({ ...dashboardQuery, limit: 8 }),
        listDashboardReconciliationExceptions({ ...dashboardQuery, limit: 4 }),
        listDashboardWinners({ ...dashboardQuery, limit: 4 }),
        getAdminDeliverySummary(),
        listAdminSupportRequests({ status: "SUBMITTED" }),
        listAdminLeads({ status: "NEW" }),
        listSubscriptionRequests("admin", {
          status: "SUBMITTED",
          page: 1,
          pageSize: 1,
        }),
      ]);

      setLegacy(legacyPayload);
      setCanonical(canonicalPayload);
      setOverdue(overduePayload);
      setUpcoming(upcomingPayload);
      setRecentPayments(recentPaymentsPayload);
      setReconciliationItems(reconciliationPayload);
      setWinnerItems(winnerPayload);
      setDeliverySummary(deliverySummaryPayload);
      setSupportQueue(supportQueuePayload);
      setLeadQueue(leadQueuePayload);
      setRequestQueue(requestQueuePayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setLegacy(null);
        setCanonical(null);
        setDeliverySummary(null);
        setSupportQueue(null);
        setLeadQueue(null);
        setRequestQueue(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [dashboardQuery]);

  useEffect(() => {
    void loadDashboard("initial");
  }, [loadDashboard]);

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
  const overdueFollowUpHref = ROUTES.admin.emisOverdue;
  const flaggedPaymentQueueHref = buildAdminReconciliationRoute({
    view: "payments",
    flagged: true,
  });
  const dueCollectionWorkspaceHref = buildAdminCollectionsRoute();
  const deliveryQueueHref = buildAdminDeliveriesRoute({ bucket: "PENDING" });
  const supportQueueHref = buildAdminSupportRequestsRoute({ status: "SUBMITTED" });
  const onboardingRequestsHref = buildAdminSubscriptionRequestsRoute({
    status: "SUBMITTED",
  });
  const newLeadQueueHref = buildAdminLeadsRoute({ status: "NEW" });
  const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
    0,
    8
  );
  const paymentRows = recentPayments?.results ?? [];
  const flaggedRows = reconciliationItems?.results ?? [];
  const winnerRows = winnerItems?.results ?? [];
  const deliveryActionCount = deliverySummary
    ? deliverySummary.pending +
      deliverySummary.scheduled +
      deliverySummary.in_transit
    : 0;
  const supportActionCount = supportQueue?.count ?? 0;
  const onboardingActionCount = (requestQueue?.count ?? 0) + (leadQueue?.count ?? 0);

  return (
    <PortalPage
      title="Admin Dashboard"
      subtitle="Unified admin workspace for EMI operations, retail-ready billing, inventory control, partner finance, and governance, with canonical customer-backed finance truth preserved underneath."
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        {
          href: ROUTES.admin.paymentsCreate,
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: overdueFollowUpHref,
          label: "Review Overdue EMI",
          variant: "secondary",
        },
        {
          href: flaggedPaymentQueueHref,
          label: "Flagged Reconciliation",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.subscriptionsCreate,
          label: "New Contract",
          variant: "ghost",
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
            <WorkspaceSection
              title="Daily action buckets"
              description="Each bucket opens the existing canonical operational workspace with live filters applied, so admin can move directly from summary posture into the real queue."
              contentClassName="grid gap-4 lg:grid-cols-2 xl:grid-cols-3"
            >
              <ActionBucketCard
                eyebrow="Collections & EMI"
                title="Overdue EMI follow-up"
                value={String(summary.overdue_emis ?? 0)}
                detail={`${money(summary.overdue_amount)} is currently overdue in canonical scope. Open the overdue lane or jump to the collections workspace.`}
                primaryHref={overdueFollowUpHref}
                primaryLabel="Open overdue queue"
                secondaryHref={dueCollectionWorkspaceHref}
                secondaryLabel="Open collections"
                tone={(summary.overdue_emis ?? 0) > 0 ? "warning" : "success"}
              />
              <ActionBucketCard
                eyebrow="Collections & EMI"
                title="Flagged payment reconciliation"
                value={String(reconciliationSurface?.flagged_count ?? 0)}
                detail={`${reconciliationSurface?.checked_count ?? 0} rows were checked in the current scope. Open the flagged payment queue for controlled follow-up.`}
                primaryHref={flaggedPaymentQueueHref}
                primaryLabel="Open payment queue"
                secondaryHref={buildAdminReconciliationRoute({ flagged: true })}
                secondaryLabel="Subscription attention"
                tone={
                  (reconciliationSurface?.flagged_count ?? 0) > 0
                    ? "warning"
                    : "success"
                }
              />
              <ActionBucketCard
                eyebrow="Fulfillment"
                title="Pending delivery actions"
                value={String(deliveryActionCount)}
                detail={`${deliverySummary?.pending ?? 0} pending, ${deliverySummary?.scheduled ?? 0} scheduled, and ${deliverySummary?.in_transit ?? 0} in transit. Open the canonical delivery register.`}
                primaryHref={deliveryQueueHref}
                primaryLabel="Open delivery queue"
                secondaryHref={ROUTES.admin.deliveries}
                secondaryLabel="All deliveries"
                tone={deliveryActionCount > 0 ? "warning" : "success"}
              />
              <ActionBucketCard
                eyebrow="Control Center"
                title="Pending support issues"
                value={String(supportActionCount)}
                detail={`${supportQueue?.summary.unassigned ?? 0} are currently unassigned in the submitted support queue. Open the live admin support workspace.`}
                primaryHref={supportQueueHref}
                primaryLabel="Open support queue"
                secondaryHref={ROUTES.admin.supportRequests}
                secondaryLabel="All support"
                tone={supportActionCount > 0 ? "warning" : "success"}
              />
              <ActionBucketCard
                eyebrow="Partner Finance"
                title="Commission and payout actions"
                value={String(legacy.commission_summary?.pending_count ?? 0)}
                detail={`${money(legacy.commission_summary?.pending_commission)} is waiting settlement. Open commission finance or the payout queue without leaving the canonical routes.`}
                primaryHref={ROUTES.admin.financeCommissions}
                primaryLabel="Open commissions"
                secondaryHref={ROUTES.admin.financeSettledCommissions}
                secondaryLabel="Open payout queue"
                tone={
                  (legacy.commission_summary?.pending_count ?? 0) > 0
                    ? "warning"
                    : "info"
                }
              />
              <ActionBucketCard
                eyebrow="Sales & Onboarding"
                title="Onboarding handoff"
                value={String(onboardingActionCount)}
                detail={`${requestQueue?.count ?? 0} submitted subscription request(s) and ${leadQueue?.count ?? 0} new lead(s) still need operator handoff into real customer or contract records.`}
                primaryHref={onboardingRequestsHref}
                primaryLabel="Open request queue"
                secondaryHref={newLeadQueueHref}
                secondaryLabel="Open new leads"
                tone={onboardingActionCount > 0 ? "info" : "success"}
              />
            </WorkspaceSection>

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
              title="Enterprise module map"
              description="The sidebar now exposes the ERP-ready admin information architecture only through canonical routes. Legacy paths remain compatibility-only while shared master data stays centered on product, inventory, billing mirror, and accounting boundaries."
              contentClassName="grid gap-4 xl:grid-cols-2"
            >
              {ADMIN_ENTERPRISE_MODULES.map((item) => (
                <article
                  key={item.key}
                  className="rounded-[1.45rem] border border-white/75 bg-white/75 px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.52)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link
                        href={item.href}
                        className="text-base font-semibold text-slate-950 transition hover:text-sky-700"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {item.description}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Canonical
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[1.1rem] border border-white/80 bg-white/80 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Operational focus
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {item.operationalFocus}
                      </div>
                    </div>
                    <div className="rounded-[1.1rem] border border-white/80 bg-white/80 px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Master-data direction
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {item.masterDataDirection}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.routes.map((route) => (
                      <ActionButton
                        key={`${item.key}-${route.href}`}
                        href={route.href}
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                      >
                        {route.label}
                      </ActionButton>
                    ))}
                  </div>
                </article>
              ))}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
