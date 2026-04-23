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
  ClipboardCheck,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wallet,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import DashboardWidgetBoard, {
  type DashboardWidgetDefinition,
} from "@/components/dashboard/DashboardWidgetBoard";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import ActionButton from "@/components/ui/ActionButton";
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
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[1.35rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_14px_40px_-32px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-[var(--surface-strong)] text-foreground">
          {icon}
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p>
      {meta ? <div className="mt-3 text-xs font-semibold text-foreground">{meta}</div> : null}
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
      <PortalPage title="Executive Dashboard" subtitle="Minimal launch control surface for daily decision signals." breadcrumbs={[{ label: "Admin" }]}>
        <LoadingBlock label="Loading executive dashboard..." />
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage
        title="Executive Dashboard"
        subtitle="Minimal launch control surface for daily decision signals."
        breadcrumbs={[{ label: "Admin" }]}
      >
        <ErrorState title="Unable to load executive dashboard" description={error} onRetry={() => void loadPage("initial")} />
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Executive Summary"
      title="Executive Dashboard"
      subtitle="Minimal decision surface for collections posture, settlement risk, urgent action, and route-safe launch points."
      helperNote="Detailed analytics and action queues live in Reports, Finance Control, and Operations Workspace. This page stays summary-only."
      helperTone="info"
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        { href: ROUTES.admin.operations, label: "Operations Workspace", variant: "primary" },
        { href: ROUTES.admin.finance, label: "Finance Control", variant: "secondary" },
        { href: ROUTES.admin.reports, label: "Reports", variant: "secondary" },
      ]}
      stats={[
        { label: "Collections Today", value: money(todayNet), tone: "success" },
        {
          label: "Outstanding Receivables",
          value: money(summary?.outstanding_amount ?? legacy?.financial?.total_outstanding ?? "0.00"),
          tone: toNumber(summary?.outstanding_amount ?? legacy?.financial?.total_outstanding) > 0 ? "warning" : "success",
        },
        { label: "Overdue EMI", value: String(overdueCount), tone: overdueCount > 0 ? "warning" : "success" },
        {
          label: "Reconciliation Flags",
          value: String(reconciliationFlags),
          tone: reconciliationFlags > 0 ? "warning" : "success",
        },
      ]}
      statusBadge={{
        label: summary?.has_payment_adjustments ? "Canonical + Adjustments" : "Canonical",
        tone: summary?.has_payment_adjustments ? "warning" : "info",
      }}
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <ActionButton
            type="button"
            variant="outline"
            onClick={() => void loadPage("refresh")}
            disabled={refreshing}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
        </div>

        <DashboardWidgetBoard
          storageKey={widgetStorageKey}
          version={1}
          title="Executive control center widgets"
          description="Rearrange operational widgets, pin what matters most, hide optional cards, and reset to the default admin cockpit layout."
          presets={[
            {
              id: "collections-heavy",
              label: "Collections heavy",
              description: "Prioritize due follow-up, quick actions, and launch access to collections.",
              order: ["quick-actions", "urgent-attention", "settlement-posture", "launch-points"],
              pinned: ["quick-actions", "urgent-attention"],
            },
            {
              id: "support-heavy",
              label: "Support heavy",
              description: "Bring attention and launch surfaces up for support-response days.",
              order: ["urgent-attention", "launch-points", "quick-actions", "settlement-posture"],
              pinned: ["urgent-attention"],
            },
            {
              id: "finance-watch",
              label: "Finance watch",
              description: "Keep settlement and attention widgets dominant for close/reconciliation windows.",
              order: ["settlement-posture", "urgent-attention", "launch-points", "quick-actions"],
              pinned: ["settlement-posture", "urgent-attention"],
            },
            {
              id: "sales-followup",
              label: "Sales follow-up",
              description: "Emphasize quick actions and launch points for onboarding/sales throughput.",
              order: ["quick-actions", "launch-points", "urgent-attention", "settlement-posture"],
              pinned: ["quick-actions", "launch-points"],
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
                <WorkspaceSection
                  title="Quick actions"
                  description="Drawer-first launch for high-frequency workflows. Canonical pages remain the source of truth for deep audit and long forms."
                  action={
                    <div className="flex flex-wrap gap-2">
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
                  }
                >
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                      Financial posting stays server-validated; the drawer never bypasses service-layer allocation rules.
                    </div>
                    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                      Use the sidebar Favorites + command palette (Ctrl+K) to reduce navigation cost under daily ops.
                    </div>
                    <div className="rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.76)]">
                      Deep link pages remain canonical for reconciliation, receipts, reversals, and audit review.
                    </div>
                  </div>
                </WorkspaceSection>
              ),
            },
            {
              id: "settlement-posture",
              title: "Settlement posture",
              subtitle: "Core finance summary with next-due and delivery signal visibility.",
              group: "core",
              fixed: true,
              defaultPinned: true,
              content: (
                <WorkspaceSection
                  title="Settlement Posture"
                  description="Read-only finance posture from canonical dashboard summaries. Posting, waiver, and reconciliation truth stays in backend service flows."
                  actionHref={ROUTES.admin.finance}
                  actionLabel="Open Finance Control"
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Posture"
                      value={settlementPosture?.badgeLabel ?? "Unavailable"}
                      subtext={settlementPosture?.description ?? "No canonical summary returned"}
                      tone={overdueCount > 0 || reconciliationFlags > 0 ? "warning" : "success"}
                      icon={<ShieldCheck className="h-5 w-5" />}
                    />
                    <StatCard
                      label="Next Due"
                      value={summary?.next_due_amount ? money(summary.next_due_amount) : "—"}
                      subtext={
                        summary?.next_due_date
                          ? `${summary.next_due_subscription_number ?? "Subscription"} · ${formatDate(summary.next_due_date)}`
                          : "No next due row visible"
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
                </WorkspaceSection>
              ),
            },
            {
              id: "urgent-attention",
              title: "Urgent attention",
              subtitle: "Core watchlist for overdue, reconciliation, and delivery risk signals.",
              group: "attention",
              fixed: true,
              content: (
                <WorkspaceSection
                  title="Urgent Attention"
                  description="Only decision-driving issues appear here. Use Operations Workspace for the full action queue."
                  actionHref={ROUTES.admin.operations}
                  actionLabel="Open Operations"
                >
                  {attentionItems.length === 0 ? (
                    <EmptyState
                      title="No urgent launch issues"
                      description="Overdue EMI, reconciliation, and delivery action signals are currently quiet."
                    />
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-3">
                      {attentionItems.map((item) => (
                        <Link
                          key={item.title}
                          href={item.href}
                          className="rounded-[1.25rem] border border-border bg-[var(--surface-card-elevated)] p-4 transition hover:-translate-y-0.5 hover:bg-[var(--surface-muted)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-foreground">{item.title}</div>
                              <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</div>
                            </div>
                            <AlertTriangle className={item.tone === "warning" ? "h-5 w-5 text-amber-700" : "h-5 w-5 text-slate-600"} />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </WorkspaceSection>
              ),
            },
            {
              id: "launch-points",
              title: "Launch points",
              subtitle: "Route-safe entry points for finance, operations, CRM, and billing surfaces.",
              group: "operational",
              content: (
                <WorkspaceSection
                  title="Launch Points"
                  description="Route-safe entry points for daily shop workflows, reports, and finance controls."
                >
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <LaunchCard
              title="Operations Workspace"
              description="Overdue collections, deliveries, reminders, support, onboarding, inventory, and purchase queues."
              href={ROUTES.admin.operations}
              icon={<ClipboardCheck className="h-5 w-5" />}
              meta={`${overdueCount + deliveryActions + reconciliationFlags} active signals`}
            />
            <LaunchCard
              title="Finance Control"
              description="Collections posture, receivables, reconciliation exceptions, commissions, payouts, accounting, and purchase obligations."
              href={ROUTES.admin.finance}
              icon={<Landmark className="h-5 w-5" />}
              meta={`${reconciliationPosture.badgeLabel} reconciliation`}
            />
            <LaunchCard
              title="Reports Center"
              description="Collections performance, overdue exposure, payment method mix, batch performance, and reconciliation health."
              href={ROUTES.admin.reports}
              icon={<BarChart3 className="h-5 w-5" />}
              meta="Live report surfaces"
            />
            <LaunchCard
              title="Collect Payment"
              description="Open controlled payment collection without bypassing backend posting and Advance EMI allocation logic."
              href={ROUTES.admin.paymentsCreate}
              icon={<Banknote className="h-5 w-5" />}
              meta="Service-layer posting"
            />
            <LaunchCard
              title="Collections"
              description="Open the collections workspace with subscription and EMI follow-up context."
              href={buildAdminCollectionsRoute()}
              icon={<Wallet className="h-5 w-5" />}
            />
            <LaunchCard
              title="Accounting"
              description="Chart of accounts, books, bridges, vendors, purchase, expenses, and payroll workflows."
              href={ROUTES.admin.accounting}
              icon={<Landmark className="h-5 w-5" />}
            />
            <LaunchCard
              title="Direct Sales"
              description="Open retail billing and direct sale registration separate from EMI subscription truth."
              href={ROUTES.admin.billingDirectSales}
              icon={<Banknote className="h-5 w-5" />}
            />
            <LaunchCard
              title="Setup Readiness"
              description="Business setup checklist, branches, counters, finance accounts, and imports."
              href={ROUTES.admin.settingsBusinessSetup}
              icon={<ClipboardCheck className="h-5 w-5" />}
            />
                  </div>
                </WorkspaceSection>
              ),
            },
          ] satisfies DashboardWidgetDefinition[]}
        />
      </div>
    </PortalPage>
  );
}
