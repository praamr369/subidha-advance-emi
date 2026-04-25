"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Layers3,
  RefreshCw,
  Sparkles,
  Wallet,
} from "lucide-react";

import DashboardTimeWindowSelector from "@/components/dashboard/DashboardTimeWindowSelector";
import DashboardSurfaceExportActions from "@/components/dashboard/DashboardSurfaceExportActions";
import DashboardWidgetBoard from "@/components/dashboard/DashboardWidgetBoard";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import CustomerProductSummaryCard from "@/domains/subscriptions/components/CustomerProductSummaryCard";
import {
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import { ROUTES } from "@/lib/routes";
import { getCustomerDashboard } from "@/services/customer";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardUpcoming,
  listDashboardWinners,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import type { DashboardWindowPreset } from "@/services/dashboard-types";

type LegacyDashboardResponse = Awaited<ReturnType<typeof getCustomerDashboard>>;
type LegacyDashboardData = NonNullable<LegacyDashboardResponse>;
type CustomerSubscription = LegacyDashboardData["subscriptions"][number];
type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DashboardDuePayload = Awaited<ReturnType<typeof listDashboardOverdue>>;
type DashboardPaymentsPayload = Awaited<
  ReturnType<typeof listDashboardRecentPayments>
>;
type DashboardWinnersPayload = Awaited<ReturnType<typeof listDashboardWinners>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load customer workspace.";
}

function statusPriority(subscription: CustomerSubscription): number {
  switch ((subscription.status || "").toUpperCase()) {
    case "ACTIVE":
      return 0;
    case "WON":
      return 1;
    case "COMPLETED":
      return 2;
    default:
      return 3;
  }
}

type QuickLink = {
  title: string;
  description: string;
  href: string;
};

function QuickLinkCard({ title, description, href }: QuickLink) {
  return (
    <Link
      href={href}
      className="group workspace-section-shell surface-panel-elevated rounded-[1.6rem] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_26px_60px_-36px_rgba(15,23,42,0.52)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      <span className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--surface-border-strong)]/75 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <span className="rounded-2xl border border-[color-mix(in_oklab,var(--surface-border-strong)_76%,white_24%)] bg-[var(--surface-card-elevated)] p-2 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition group-hover:text-slate-900">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}

export default function CustomerDashboardPage() {
  const [legacy, setLegacy] = useState<LegacyDashboardResponse | null>(null);
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [upcoming, setUpcoming] = useState<DashboardDuePayload | null>(null);
  const [overdue, setOverdue] = useState<DashboardDuePayload | null>(null);
  const [recentPayments, setRecentPayments] =
    useState<DashboardPaymentsPayload | null>(null);
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

  const loadPage = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [
          legacyResult,
          canonicalResult,
          overdueResult,
          upcomingResult,
          recentPaymentsResult,
          winnersResult,
        ] = await Promise.allSettled([
          getCustomerDashboard(),
          getDashboardSummaryV2(dashboardQuery),
          listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
          listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
          listDashboardRecentPayments({ ...dashboardQuery, limit: 6 }),
          listDashboardWinners({ ...dashboardQuery, limit: 4 }),
        ]);

        if (legacyResult.status !== "fulfilled") {
          throw legacyResult.reason;
        }

        setLegacy(legacyResult.value);
        setCanonical(
          canonicalResult.status === "fulfilled" ? canonicalResult.value : null
        );
        setOverdue(overdueResult.status === "fulfilled" ? overdueResult.value : null);
        setUpcoming(
          upcomingResult.status === "fulfilled" ? upcomingResult.value : null
        );
        setRecentPayments(
          recentPaymentsResult.status === "fulfilled"
            ? recentPaymentsResult.value
            : null
        );
        setWinnerItems(winnersResult.status === "fulfilled" ? winnersResult.value : null);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
        setLegacy(null);
        setCanonical(null);
        setOverdue(null);
        setUpcoming(null);
        setRecentPayments(null);
        setWinnerItems(null);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    [dashboardQuery]
  );

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const summary =
    canonical?.summary ??
    (legacy?.summary
      ? normalizeDashboardSummary(
          legacy.summary as unknown as Record<string, unknown>
        )
      : undefined);
  const winnerSurface = canonical?.winner_surface;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const winnerPosture = buildWinnerPosture(winnerSurface, summary);
  const dueRows = [...(overdue?.results ?? []), ...(upcoming?.results ?? [])].slice(
    0,
    6
  );
  const paymentRows = recentPayments?.results ?? [];
  const winnerRows = winnerItems?.results ?? [];
  const spotlightSubscriptions =
    legacy?.subscriptions
      ?.slice()
      .sort((left, right) => {
        const priorityDelta = statusPriority(left) - statusPriority(right);
        if (priorityDelta !== 0) return priorityDelta;

        const leftOutstanding = Number(
          left.financial_summary?.remaining_amount ??
            left.financial_summary?.outstanding_amount ??
            left.outstanding_amount ??
            0
        );
        const rightOutstanding = Number(
          right.financial_summary?.remaining_amount ??
            right.financial_summary?.outstanding_amount ??
            right.outstanding_amount ??
            0
        );

        return rightOutstanding - leftOutstanding;
      })
      .slice(0, 3) ?? [];

  const quickLinks: QuickLink[] = [
    {
      title: "My Subscriptions",
      description: "Open contract detail, winner posture, and product status by subscription.",
      href: ROUTES.customer.subscriptions,
    },
    {
      title: "My Payments",
      description: "Review recorded payment rows and the current settled total.",
      href: ROUTES.customer.payments,
    },
    {
      title: "Support",
      description: "Raise a support request if a payment or contract detail needs follow-up.",
      href: ROUTES.customer.support,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer Operations"
        title="Customer Workspace"
        description="View subscriptions, payment records, profile information, and support resources."
        helperNote="Figures and statuses below come from your live subscription and payment records, including due and winner posture."
        helperTone="info"
        actions={
          <ActionButton
            variant="outline"
            onClick={() => void loadPage("refresh")}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
        }
      />

      <DashboardTimeWindowSelector
        value={windowPreset}
        startDate={startDate}
        endDate={endDate}
        loading={loading || refreshing}
        onWindowChange={setWindowPreset}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      <WorkspaceSection
        title="Workspace quick lanes"
        description="Open common customer workflows quickly while keeping contract, payment, and support routes separate."
      >
        <DashboardWidgetBoard
          storageKey="subidha:dashboard-widgets:customer:v1"
          version={1}
          title="Customer lane widgets"
          description="Simple customer lane controls for subscription, payment, and support routes."
          presets={[
            {
              id: "subscription-first",
              label: "Subscription first",
              description: "Prioritize subscription and payment visibility.",
              order: ["subs", "payments", "support"],
              pinned: ["subs", "payments"],
            },
            {
              id: "support-first",
              label: "Support first",
              description: "Prioritize support escalation while preserving subscription context.",
              order: ["support", "subs", "payments"],
              pinned: ["support"],
            },
          ]}
          widgets={[
            {
              id: "subs",
              title: "My subscriptions",
              subtitle: "Contract and winner posture overview.",
              group: "core",
              fixed: true,
              content: (
                <ActionButton href={ROUTES.customer.subscriptions} variant="outline" className="justify-between">
                  Open subscriptions
                  <ArrowRight className="h-4 w-4" />
                </ActionButton>
              ),
            },
            {
              id: "payments",
              title: "My payments",
              subtitle: "Payment register and receipt lookup.",
              group: "quick-actions",
              content: (
                <ActionButton href={ROUTES.customer.payments} variant="outline" className="justify-between">
                  Open payments
                  <ArrowRight className="h-4 w-4" />
                </ActionButton>
              ),
            },
            {
              id: "support",
              title: "Support requests",
              subtitle: "Escalate customer-side issues safely.",
              group: "operational",
              content: (
                <ActionButton href={ROUTES.customer.support} variant="outline" className="justify-between">
                  Open support
                  <ArrowRight className="h-4 w-4" />
                </ActionButton>
              ),
            },
          ]}
        />
      </WorkspaceSection>

      {loading ? <LoadingBlock label="Loading customer workspace..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="Unable to load customer workspace"
          description={error}
          onRetry={() => void loadPage("initial")}
        />
      ) : null}

      {!loading && !error && legacy && summary ? (
        <>
          <section className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94),rgba(239,246,255,0.92))] p-6 shadow-[0_28px_90px_-54px_rgba(15,23,42,0.5)]">
            <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-sky-200/25 blur-3xl" />
            <div className="pointer-events-none absolute left-0 top-0 h-28 w-28 rounded-full bg-amber-200/20 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 shadow-sm">
                  <Sparkles className="h-3.5 w-3.5" />
                  Financial alignment
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  {legacy.customer.name || "Customer"}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                  Paid, remaining, overdue, and winner-related figures here come
                  from the same canonical summary-v2 flow now shared across all
                  dashboards, so settlement and waiver posture stay aligned.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:w-[360px]">
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    KYC status
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {legacy.customer.kyc_status || "PENDING"}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Phone
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {legacy.customer.phone || "—"}
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Contracts
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {summary.subscription_count ?? legacy.subscriptions.length} total
                  </div>
                </div>
                <div className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Winner history
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {summary.winner_subscriptions ?? 0} subscription
                    {(summary.winner_subscriptions ?? 0) === 1 ? "" : "s"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Paid"
              value={money(summary.total_paid_amount)}
              subtext={`${summary.paid_emis} EMI settled through recorded payments`}
              tone="success"
              icon={<Wallet className="h-5 w-5" />}
            />
            <StatCard
              label="Remaining"
              value={money(summary.remaining_amount ?? summary.outstanding_amount)}
              subtext={`${money(summary.total_pending_amount)} still open across current contracts`}
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
              subtext={`${money(summary.overdue_amount)} currently past due`}
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
                  : "No upcoming EMI currently visible"
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
                  <h3 className="mt-3 text-xl font-semibold text-slate-950">
                    {settlementPosture?.title}
                  </h3>
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
                    Next payment due
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {summary.next_due_date
                      ? `${money(summary.next_due_amount)} on ${formatDate(
                          summary.next_due_date
                        )}`
                      : "No pending EMI"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {summary.next_due_subscription_number || "No contract pending"}
                  </div>
                </div>
                <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Active contracts
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {summary.active_subscriptions}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {summary.completed_subscriptions ?? 0} completed
                  </div>
                </div>
                <div className="rounded-[1.3rem] border border-white/80 bg-white/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Payment adjustments
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-950">
                    {summary.has_payment_adjustments ? "Recorded" : "None"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Settled totals already reflect any reversal history.
                  </div>
                </div>
              </div>
            </section>

            <WorkspaceSection
              title={winnerPosture.title}
              description={winnerPosture.description}
              className="h-full rounded-[1.8rem]"
              action={
                <DashboardSurfaceExportActions
                  query={dashboardQuery}
                  actions={[{ surface: "winners", label: "Export CSV" }]}
                />
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Waived by benefit"
                  value={money(
                    winnerSurface?.total_waived_amount ?? summary.total_waived_amount
                  )}
                  subtext={`${winnerSurface?.waived_emis ?? summary.waived_emis ?? 0} EMI rows already marked waived`}
                  tone="info"
                  icon={<BadgeCheck className="h-5 w-5" />}
                />
                <StatCard
                  label="Contracts in view"
                  value={String(summary.subscription_count ?? legacy.subscriptions.length)}
                  subtext={`${summary.winner_subscriptions ?? 0} with winner history`}
                  tone="default"
                  icon={<Layers3 className="h-5 w-5" />}
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
                        {row.waived_amount ? ` • Waived ${money(row.waived_amount)}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </WorkspaceSection>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <WorkspaceSection
              title="Due collection queue"
              description="Your next-due rows and overdue rows now come from the same canonical surface layer used across every dashboard."
              action={
                <>
                  <ActionButton
                    href={ROUTES.customer.subscriptions}
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
                  {dueRows.map((item) => (
                    <div
                      key={`${item.subscription_id ?? item.id}-${item.emi_id ?? "na"}`}
                      className="rounded-2xl border border-white/75 bg-white/75 p-4"
                    >
                      <div className="text-sm font-semibold text-foreground">
                        {item.subscription_number || `SUB-${String(item.subscription_id ?? item.id)}`}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.product_name || "Linked product"} · Batch {item.batch_code || "—"} · Lucky{" "}
                        {item.lucky_number ?? "—"}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Due {formatDate(item.due_date)} · Pending {money(item.pending_amount)}
                        {item.is_overdue && item.overdue_days
                          ? ` · ${item.overdue_days} day(s) overdue`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No due contracts in this window"
                  description="The selected drilldown window is not currently returning any next-due or overdue rows."
                />
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Recent payment surface"
              description="Recent recorded payment rows from the canonical recent-payments surface."
              action={
                <>
                  <ActionButton
                    href={ROUTES.customer.payments}
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
                            {item.subscription_number || `Payment #${item.payment_id}`}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.method || "—"}
                            {item.reference_no ? ` · Ref ${item.reference_no}` : ""}
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
                  title="No recent payments in this window"
                  description="No recorded payment rows are visible for the selected drilldown window."
                />
              )}
            </WorkspaceSection>
          </div>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Subscription overview
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Priority contracts are surfaced here with their linked product,
                current remaining amount, and winner posture.
              </p>
            </div>

            {spotlightSubscriptions.length > 0 ? (
              <div className="grid gap-4 xl:grid-cols-3">
                {spotlightSubscriptions.map((subscription) => (
                  <CustomerProductSummaryCard
                    key={subscription.id}
                    subscription={subscription}
                    href={`${ROUTES.customer.subscriptions}/${subscription.id}`}
                    compact
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No subscriptions yet"
                description="Once your contracts are active, they will appear here with product and settlement context."
              />
            )}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Go next</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the next customer workflow without leaving this financial overview.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {quickLinks.map((item) => (
                <QuickLinkCard key={item.href} {...item} />
              ))}
            </div>
          </section>
        </>
      ) : null}

      {!loading && !error && !legacy ? (
        <EmptyState
          title="No customer workspace data"
          description="Customer dashboard data is not currently available."
        />
      ) : null}
    </div>
  );
}
