"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Landmark,
  LayoutGrid,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DashboardWidgetBoard, {
  type DashboardWidgetDefinition,
} from "@/components/dashboard/DashboardWidgetBoard";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import ActionButton from "@/components/ui/ActionButton";
import { PageSection } from "@/components/ui/portal-primitives";
import { useWorkflowLauncher } from "@/components/workflows/WorkflowProvider";
import {
  buildReconciliationPosture,
  buildSettlementPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import {
  buildAdminCollectionsRoute,
  buildAdminDeliveriesRoute,
  buildAdminReconciliationRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getAdminDashboard, type AdminDashboardResponse } from "@/services/admin";
import { getBranchReportingOverview, type BranchReportingOverview } from "@/services/branch-control";
import { getAdminDeliverySummary } from "@/services/deliveries";
import { getDashboardSummaryV2 } from "@/services/dashboards";
import { cn } from "@/lib/utils";

type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DeliverySummaryPayload = Awaited<ReturnType<typeof getAdminDeliverySummary>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load executive dashboard.";
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
}

function LaunchCard({
  title,
  description,
  href,
  icon,
  meta,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  meta?: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-[1.35rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_14px_40px_-32px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-[var(--surface-strong)] text-foreground">
          {icon}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {badge ? (
            <span className="rounded-full border border-border/80 bg-[var(--surface-muted)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {badge}
            </span>
          ) : null}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
      {meta ? <div className="mt-2.5 text-xs font-medium text-foreground/90">{meta}</div> : null}
    </Link>
  );
}

function MoreLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 py-2 text-sm font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { openWorkflow } = useWorkflowLauncher();
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [legacy, setLegacy] = useState<AdminDashboardResponse | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummaryPayload | null>(null);
  const [todayBranch, setTodayBranch] = useState<BranchReportingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const today = todayIso();
      const [canonicalPayload, legacyPayload, deliveryPayload, todayBranchPayload] =
        await Promise.all([
          getDashboardSummaryV2({ window: "THIS_MONTH" }),
          getAdminDashboard(),
          getAdminDeliverySummary(),
          getBranchReportingOverview({ start_date: today, end_date: today }),
        ]);

      setCanonical(canonicalPayload);
      setLegacy(legacyPayload);
      setDeliverySummary(deliveryPayload);
      setTodayBranch(todayBranchPayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const summary = canonical?.summary ?? legacy?.summary;
  const reconciliation = canonical?.reconciliation ?? legacy?.reconciliation;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const reconciliationPosture = buildReconciliationPosture(reconciliation);
  const todayNet = todayBranch?.collections.net_amount ?? legacy?.collections?.today_net_amount ?? "0.00";
  const overdueCount = summary?.overdue_emis ?? legacy?.emi?.overdue ?? 0;
  const overdueAmount = summary?.overdue_amount ?? legacy?.summary?.overdue_amount ?? "0.00";
  const reconciliationFlags = reconciliation?.flagged_count ?? 0;
  const deliveryActions = deliverySummary
    ? deliverySummary.pending + deliverySummary.scheduled + deliverySummary.in_transit
    : 0;
  const nextDraw = legacy?.batches?.next_draw_batch;
  const widgetStorageKey = "subidha:dashboard-widgets:admin:v1";
  const outstandingRaw = summary?.outstanding_amount ?? legacy?.financial?.total_outstanding ?? "0.00";
  const outstandingNum = toNumber(outstandingRaw);

  const attentionItems = useMemo(
    () =>
      [
        overdueCount > 0
          ? {
              title: "Overdue Advance EMI follow-up",
              detail: `${overdueCount} overdue EMI rows · ${money(overdueAmount)} exposure`,
              href: ROUTES.admin.emisOverdue,
              tone: "warning" as const,
            }
          : null,
        reconciliationFlags > 0
          ? {
              title: "Reconciliation flags",
              detail: `${reconciliationFlags} flagged rows require controlled review`,
              href: buildAdminReconciliationRoute({ flagged: true }),
              tone: "warning" as const,
            }
          : null,
        deliveryActions > 0
          ? {
              title: "Delivery workload",
              detail: `${deliveryActions} pending, scheduled, or in-transit delivery actions`,
              href: buildAdminDeliveriesRoute({ bucket: "PENDING" }),
              tone: "default" as const,
            }
          : null,
      ].filter(
        (
          item
        ): item is {
          title: string;
          detail: string;
          href: string;
          tone: "default" | "warning";
        } => Boolean(item)
      ),
    [deliveryActions, overdueAmount, overdueCount, reconciliationFlags]
  );

  if (loading) {
    return (
      <PortalPage title="Executive Dashboard" subtitle="Operational summary and quick launch." breadcrumbs={[{ label: "Admin" }]}>
        <LoadingBlock label="Loading executive dashboard..." />
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage
        title="Executive Dashboard"
        subtitle="Operational summary and quick launch."
        breadcrumbs={[{ label: "Admin" }]}
      >
        <ErrorState title="Unable to load executive dashboard" description={error} onRetry={() => void loadPage("initial")} />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Admin"
      title="Executive Dashboard"
      subtitle="Live signals from the same executive endpoints used across finance and operations. Deep audit and long forms live on the linked workspaces."
      helperNote="KPIs use canonical month window plus today’s branch reporting where noted. This page is summary-only."
      helperTone="info"
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        { href: ROUTES.admin.operations, label: "Operations", variant: "primary" },
        { href: ROUTES.admin.finance, label: "Finance", variant: "secondary" },
        { href: ROUTES.admin.reports, label: "Reports", variant: "secondary" },
      ]}
      statusBadge={{
        label: summary?.has_payment_adjustments ? "Adjustments in scope" : "Live summary",
        tone: summary?.has_payment_adjustments ? "warning" : "info",
      }}
    >
      <div className="space-y-8">
        {/* Top strip: system signal + refresh */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-sky-50/90 px-3 py-1 text-xs font-semibold text-sky-900">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              {summary?.has_payment_adjustments
                ? "Canonical summary includes payment adjustments in scope"
                : "Connected to live dashboard services"}
            </span>
            <span className="text-xs sm:text-sm">Window: this month · Today: {formatDate(todayIso())}</span>
          </div>
          <ActionButton
            type="button"
            variant="outline"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing…" : "Refresh data"}
          </ActionButton>
        </div>

        <DashboardWidgetBoard
          storageKey={widgetStorageKey}
          version={1}
          title="Executive control center widgets"
          description="Customize the admin cockpit while keeping canonical finance and operations signals visible."
          presets={[
            {
              id: "collections-heavy",
              label: "Collections heavy",
              description: "Prioritize due follow-up, quick actions, and launch access to collections.",
              order: ["quick-actions", "urgent-attention", "settlement-posture", "launch-points"],
              pinned: ["quick-actions", "urgent-attention"],
            },
            {
              id: "finance-watch",
              label: "Finance watch",
              description: "Keep settlement and attention widgets dominant for close/reconciliation windows.",
              order: ["settlement-posture", "urgent-attention", "launch-points", "quick-actions"],
              pinned: ["settlement-posture", "urgent-attention"],
            },
          ]}
          widgets={[
            {
              id: "quick-actions",
              title: "Quick actions",
              subtitle: "High-frequency workflow launchers with service-layer safeguards.",
              group: "quick-actions",
              defaultPinned: true,
              content: (
                <div className="grid gap-3 sm:grid-cols-3">
                  <ActionButton variant="primary" onClick={() => openWorkflow("admin.createSubscription")}>
                    New Subscription
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.collectPayment")}>
                    Collect Payment
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.createCustomer")}>
                    New Customer
                  </ActionButton>
                </div>
              ),
            },
            {
              id: "settlement-posture",
              title: "Settlement Posture",
              subtitle: "Core finance summary with next-due, delivery, and draw signal visibility.",
              group: "core",
              fixed: true,
              defaultPinned: true,
              content: (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Posture"
                    value={settlementPosture?.badgeLabel ?? "—"}
                    subtext={settlementPosture?.description ?? "No canonical summary"}
                    tone={overdueCount > 0 || reconciliationFlags > 0 ? "warning" : "success"}
                    icon={<ShieldCheck className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Next Due"
                    value={summary?.next_due_amount ? money(summary.next_due_amount) : "—"}
                    subtext={
                      summary?.next_due_date
                        ? `${summary.next_due_subscription_number ?? "Subscription"} · ${formatDate(summary.next_due_date)}`
                        : "No next due row in summary"
                    }
                    icon={<CalendarClock className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Delivery Actions"
                    value={String(deliveryActions)}
                    subtext={`${deliverySummary?.pending ?? 0} pending · ${deliverySummary?.in_transit ?? 0} in transit`}
                    tone={deliveryActions > 0 ? "warning" : "success"}
                    href={buildAdminDeliveriesRoute({ bucket: "PENDING" })}
                    icon={<Truck className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Lucky Draw"
                    value={nextDraw?.batch_code ?? "—"}
                    subtext={
                      nextDraw?.draw_date
                        ? `${nextDraw.days_until_draw ?? 0} days to ${formatDate(nextDraw.draw_date)}`
                        : "No draw scheduled"
                    }
                    href={ROUTES.admin.luckyDraws}
                    icon={<ClipboardCheck className="h-5 w-5" />}
                  />
                </div>
              ),
            },
            {
              id: "urgent-attention",
              title: "Urgent Attention",
              subtitle: "Core watchlist for overdue, reconciliation, and delivery risk signals.",
              group: "attention",
              fixed: true,
              content:
                attentionItems.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                    No urgent overdue, reconciliation, or delivery signals in the current executive snapshot.
                  </div>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-3">
                    {attentionItems.map((item) => (
                      <Link
                        key={item.title}
                        href={item.href}
                        className="rounded-[1.25rem] border border-border bg-[var(--surface-card-elevated)] p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                      >
                        <div className="text-sm font-semibold text-foreground">{item.title}</div>
                        <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div>
                      </Link>
                    ))}
                  </div>
                ),
            },
            {
              id: "launch-points",
              title: "Launch Points",
              subtitle: "Route-safe entry points for finance, operations, CRM, and billing surfaces.",
              group: "operational",
              content: (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <LaunchCard
                    title="Finance Control"
                    description="Reconciliation, receivables, commissions, and accounting handoffs."
                    href={ROUTES.admin.finance}
                    icon={<Landmark className="h-5 w-5" />}
                    meta={reconciliationPosture.badgeLabel}
                  />
                  <LaunchCard
                    title="Reports Center"
                    description="Collections performance, exposure, and operational health from live data."
                    href={ROUTES.admin.reports}
                    icon={<BarChart3 className="h-5 w-5" />}
                  />
                  <LaunchCard
                    title="Operations Workspace"
                    description="Queues for collections, support, delivery, and onboarding."
                    href={ROUTES.admin.operations}
                    icon={<ClipboardCheck className="h-5 w-5" />}
                    meta={`${overdueCount + deliveryActions + reconciliationFlags} active signals`}
                  />
                  <LaunchCard
                    title="Collect Payment"
                    description="Open controlled payment collection without bypassing backend posting logic."
                    href={ROUTES.admin.paymentsCreate}
                    icon={<Banknote className="h-5 w-5" />}
                  />
                </div>
              ),
            },
          ] satisfies DashboardWidgetDefinition[]}
        />

        {/* Key metrics */}
        <section aria-labelledby="kpi-heading">
          <h2 id="kpi-heading" className="sr-only">
            Key performance indicators
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Collections today"
              value={money(todayNet)}
              subtext="Net from branch reporting for today"
              tone="success"
              icon={<Wallet className="h-5 w-5" />}
              trend="neutral"
              trendValue="Today’s window"
            />
            <StatCard
              label="Outstanding receivables"
              value={money(outstandingRaw)}
              subtext="From executive summary"
              tone={outstandingNum > 0 ? "warning" : "success"}
              icon={<Banknote className="h-5 w-5" />}
              trend="neutral"
              trendValue="This month"
            />
            <StatCard
              label="Overdue EMI"
              value={String(overdueCount)}
              subtext={overdueCount > 0 ? `${money(overdueAmount)} exposure` : "No overdue rows in view"}
              tone={overdueCount > 0 ? "warning" : "success"}
              href={ROUTES.admin.emisOverdue}
              icon={<AlertTriangle className="h-5 w-5" />}
              trend="neutral"
              trendValue={overdueCount > 0 ? "Action needed" : "Clear"}
            />
            <StatCard
              label="Reconciliation"
              value={String(reconciliationFlags)}
              subtext={reconciliationFlags > 0 ? "Flagged rows" : "No flags in current view"}
              tone={reconciliationFlags > 0 ? "warning" : "success"}
              href={reconciliationFlags > 0 ? buildAdminReconciliationRoute({ flagged: true }) : ROUTES.admin.reconciliation}
              icon={<ClipboardCheck className="h-5 w-5" />}
              trend="neutral"
              trendValue={reconciliationPosture.badgeLabel}
            />
          </div>
        </section>

        {/* Quick actions */}
        <PageSection className="p-0">
          <div className="border-b border-border/80 bg-[linear-gradient(180deg,color-mix(in_oklab,white_96%,var(--surface-muted)_4%),var(--surface-card-elevated))] px-5 py-4 sm:px-6 sm:py-5">
            <h2 className="text-base font-semibold text-foreground">Quick actions</h2>
            <p className="mt-1 text-sm text-muted-foreground">Launch guided workflows. Posting and allocation stay server-validated.</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            <button
              type="button"
              onClick={() => openWorkflow("admin.createSubscription")}
              className="flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border-2 border-primary/25 bg-primary text-primary-foreground shadow-[0_20px_50px_-28px_rgba(30,64,175,0.55)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <span className="text-sm font-semibold">New subscription</span>
              <span className="mt-0.5 text-xs font-medium text-primary-foreground/85">Enroll with service checks</span>
            </button>
            <button
              type="button"
              onClick={() => openWorkflow("admin.collectPayment")}
              className="flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <span className="text-sm font-semibold">Collect payment</span>
              <span className="mt-0.5 text-center text-xs text-muted-foreground">Advance EMI allocation</span>
            </button>
            <button
              type="button"
              onClick={() => openWorkflow("admin.createCustomer")}
              className="flex min-h-[4.5rem] flex-col items-center justify-center rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
            >
              <span className="text-sm font-semibold">New customer</span>
              <span className="mt-0.5 text-center text-xs text-muted-foreground">Identity before contract</span>
            </button>
          </div>
        </PageSection>

        <div className="grid items-start gap-6 lg:grid-cols-12">
          {/* Left: attention + settlement */}
          <div className="space-y-6 lg:col-span-7">
            <WorkspaceSection
              title="Needs attention"
              description="Overdue EMIs, reconciliation flags, and delivery actions that need a decision."
              actionHref={ROUTES.admin.operations}
              actionLabel="Operations workspace"
            >
              {attentionItems.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200/80 bg-[linear-gradient(180deg,rgba(236,253,245,0.55),rgba(255,255,255,0.96))] p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200/90 bg-white text-emerald-700">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">All clear in this view</p>
                      <p className="mt-1 text-sm leading-6 text-emerald-800/90">
                        No urgent overdue, reconciliation, or delivery signals in the current executive snapshot. Full queues remain
                        in Operations.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <ul className="grid gap-3" role="list">
                  {attentionItems.map((item) => (
                    <li key={item.title}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded-[1.25rem] border p-4 transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2",
                          item.tone === "warning"
                            ? "border-amber-200/90 bg-amber-50/80 hover:bg-amber-50"
                            : "border-border bg-[var(--surface-card-elevated)] hover:bg-[var(--surface-muted)]"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                          </div>
                          <AlertTriangle
                            className={cn(
                              "h-5 w-5 shrink-0",
                              item.tone === "warning" ? "text-amber-700" : "text-slate-500"
                            )}
                            aria-hidden
                          />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Settlement posture"
              description="Read-only executive posture. Posting and reconciliation truth remain in service-layer flows."
              actionHref={ROUTES.admin.finance}
              actionLabel="Finance control"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard
                  label="Posture"
                  value={settlementPosture?.badgeLabel ?? "—"}
                  subtext={settlementPosture?.description ?? "No canonical summary"}
                  tone={overdueCount > 0 || reconciliationFlags > 0 ? "warning" : "success"}
                  icon={<ShieldCheck className="h-5 w-5" />}
                />
                <StatCard
                  label="Next due"
                  value={summary?.next_due_amount ? money(summary.next_due_amount) : "—"}
                  subtext={
                    summary?.next_due_date
                      ? `${summary.next_due_subscription_number ?? "Subscription"} · ${formatDate(summary.next_due_date)}`
                      : "No next due row in summary"
                  }
                  icon={<CalendarClock className="h-5 w-5" />}
                />
                <StatCard
                  label="Delivery actions"
                  value={String(deliveryActions)}
                  subtext={`${deliverySummary?.pending ?? 0} pending · ${deliverySummary?.in_transit ?? 0} in transit`}
                  tone={deliveryActions > 0 ? "warning" : "success"}
                  href={buildAdminDeliveriesRoute({ bucket: "PENDING" })}
                  icon={<Truck className="h-5 w-5" />}
                />
                <StatCard
                  label="Lucky draw"
                  value={nextDraw?.batch_code ?? "—"}
                  subtext={
                    nextDraw?.draw_date
                      ? `${nextDraw.days_until_draw ?? 0} days to ${formatDate(nextDraw.draw_date)}`
                      : "No draw scheduled"
                  }
                  href={ROUTES.admin.luckyDraws}
                  icon={<ClipboardCheck className="h-5 w-5" />}
                />
              </div>
            </WorkspaceSection>
          </div>

          {/* Right: quick navigation */}
          <div className="space-y-4 lg:col-span-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <LayoutGrid className="h-4 w-4 text-muted-foreground" />
              Quick navigation
            </div>
            <p className="text-sm text-muted-foreground">Jump to daily workspaces. Counts are contextual hints, not separate analytics.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <LaunchCard
                title="Operations"
                description="Queues for collections, support, delivery, and onboarding."
                href={ROUTES.admin.operations}
                icon={<ClipboardCheck className="h-5 w-5" />}
                meta={`${overdueCount + deliveryActions + reconciliationFlags} active signals`}
                badge="Core"
              />
              <LaunchCard
                title="Finance control"
                description="Reconciliation, receivables, commissions, and accounting handoffs."
                href={ROUTES.admin.finance}
                icon={<Landmark className="h-5 w-5" />}
                meta={reconciliationPosture.badgeLabel}
                badge="Finance"
              />
              <LaunchCard
                title="Reports"
                description="Performance, exposure, and operational health from live data."
                href={ROUTES.admin.reports}
                icon={<BarChart3 className="h-5 w-5" />}
                badge="Analytics"
              />
              <LaunchCard
                title="Record payment"
                description="Open payment collection with the same server posting rules."
                href={ROUTES.admin.paymentsCreate}
                icon={<Banknote className="h-5 w-5" />}
                meta="Service-layer"
                badge="Post"
              />
            </div>
          </div>
        </div>

        {/* More areas */}
        <PageSection>
          <h2 className="text-sm font-semibold text-foreground">More areas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Additional entry points; same routes as before.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <MoreLink href={buildAdminCollectionsRoute()} label="Collections" />
            <MoreLink href={ROUTES.admin.accounting} label="Accounting" />
            <MoreLink href={ROUTES.admin.billingDirectSales} label="Direct sales" />
            <MoreLink href={ROUTES.admin.settingsBusinessSetup} label="Setup & readiness" />
          </div>
        </PageSection>
      </div>
    </PortalPage>
  );
}
