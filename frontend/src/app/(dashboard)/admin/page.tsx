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
  Clock3,
  FileText,
  Landmark,
  LayoutGrid,
  LockKeyhole,
  Package,
  Plus,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Truck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import ErrorState from "@/components/feedback/ErrorState";
import EmptyState from "@/components/feedback/EmptyState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { DashboardGridSkeleton } from "@/components/feedback/Skeleton";
import DashboardWidgetBoard, {
  type DashboardWidgetDefinition,
} from "@/components/dashboard/DashboardWidgetBoard";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { WorkspaceSection } from "@/components/ui/workspace";
import ActionButton from "@/components/ui/ActionButton";
import { PageSection } from "@/components/ui/portal-primitives";
import { LedgerSummary, MetricStrip, QueueList } from "@/components/ui/operations";
import StatusBadge from "@/components/ui/status-badge";
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
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { getAdminDashboard, type AdminDashboardResponse } from "@/services/admin";
import { getBranchReportingOverview, type BranchReportingOverview } from "@/services/branch-control";
import { getAdminDeliverySummary } from "@/services/deliveries";
import { getDashboardSummaryV2 } from "@/services/dashboards";
import { getHrSummary, type HrSummary } from "@/services/admin-hr";
import {
  getAdminAnalyticsSummary,
  type AdminAnalyticsSummaryResponse,
} from "@/services/reports";
import type { DashboardWindowPreset } from "@/services/dashboard-types";
import { getAdminOperationsQueueSummary } from "@/services/phase5-control";
import { getStockSummary } from "@/services/inventory";
import { cn } from "@/lib/utils";

const OPERATOR_MODE_KEY = "subidha:operator-mode:v1";
const DASHBOARD_SHELL_EVENT = "subidha:dashboard-shell";
type OperatorMode = "SIMPLE" | "ADVANCED";

type CanonicalDashboardPayload = Awaited<ReturnType<typeof getDashboardSummaryV2>>;
type DeliverySummaryPayload = Awaited<ReturnType<typeof getAdminDeliverySummary>>;
type StockSummaryPayload = Awaited<ReturnType<typeof getStockSummary>>;
type QueueSummaryPayload = {
  results?: {
    key: string;
    count: number;
    severity: string;
    oldest_pending_date?: string | null;
    detail_url?: string;
  }[];
};

type CountPayload = {
  count?: number;
  results?: unknown[];
};

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

function formatDateTime(value: Date | null): string {
  if (!value) return "Not refreshed yet";
  return value.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function extractCount(payload: CountPayload | unknown): number {
  if (payload && typeof payload === "object") {
    const objectPayload = payload as CountPayload;
    if (typeof objectPayload.count === "number" && Number.isFinite(objectPayload.count)) {
      return objectPayload.count;
    }
    if (Array.isArray(objectPayload.results)) return objectPayload.results.length;
  }
  return Array.isArray(payload) ? payload.length : 0;
}

async function getReadyToLockBatchCount(): Promise<number> {
  try {
    const payload = await apiFetch<CountPayload | unknown>("/admin/batches/?status=READY_TO_LOCK");
    return extractCount(payload);
  } catch {
    return 0;
  }
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

function CommandSection({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-[1.45rem] border border-[color-mix(in_oklab,var(--surface-border-strong)_70%,white_30%)] bg-white/95 p-4 shadow-[0_18px_54px_-44px_rgba(76,45,24,0.55)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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

const REQUIRED_QUEUE_KEYS = [
  "partner_payment_requests_pending",
  "subscription_requests_pending",
  "customer_kyc_pending",
  "deposit_refunds_pending",
  "reconciliation_pending",
  "delivery_blocked",
  "return_inspections_pending",
  "overdue_payments",
  "low_stock_alerts",
  "support_requests_pending",
] as const;

const QUEUE_LABELS: Record<string, string> = {
  partner_payment_requests_pending: "Partner Payment Requests",
  subscription_requests_pending: "Subscription Requests",
  customer_kyc_pending: "KYC Pending",
  deposit_refunds_pending: "Deposit Refund Pending",
  reconciliation_pending: "Reconciliation Pending",
  delivery_blocked: "Delivery Blocked",
  return_inspections_pending: "Return Inspection Pending",
  overdue_payments: "Overdue Payments",
  low_stock_alerts: "Low Stock Alerts",
  support_requests_pending: "Support Requests Pending",
};

export default function AdminDashboardPage() {
  const { openWorkflow } = useWorkflowLauncher();
  const [canonical, setCanonical] = useState<CanonicalDashboardPayload | null>(null);
  const [legacy, setLegacy] = useState<AdminDashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummaryResponse | null>(null);
  const [deliverySummary, setDeliverySummary] = useState<DeliverySummaryPayload | null>(null);
  const [todayBranch, setTodayBranch] = useState<BranchReportingOverview | null>(null);
  const [queueSummary, setQueueSummary] = useState<QueueSummaryPayload | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummaryPayload | null>(null);
  const [hrSummary, setHrSummary] = useState<HrSummary | null>(null);
  const [readyToLockBatches, setReadyToLockBatches] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operatorMode, setOperatorMode] = useState<OperatorMode>("SIMPLE");
  const [summaryWindow, setSummaryWindow] = useState<DashboardWindowPreset>("THIS_MONTH");

  useEffect(() => {
    function syncOperatorMode() {
      try {
        const stored = window.localStorage.getItem(OPERATOR_MODE_KEY);
        setOperatorMode(stored === "ADVANCED" ? "ADVANCED" : "SIMPLE");
      } catch {
        setOperatorMode("SIMPLE");
      }
    }

    syncOperatorMode();
    window.addEventListener("storage", syncOperatorMode);
    window.addEventListener(DASHBOARD_SHELL_EVENT, syncOperatorMode);
    return () => {
      window.removeEventListener("storage", syncOperatorMode);
      window.removeEventListener(DASHBOARD_SHELL_EVENT, syncOperatorMode);
    };
  }, []);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const today = todayIso();
      const [
        canonicalPayload,
        legacyPayload,
        analyticsPayload,
        deliveryPayload,
        todayBranchPayload,
        queuePayload,
        stockPayload,
        hrPayload,
        readyToLockPayload,
      ] =
        await Promise.all([
          getDashboardSummaryV2({ window: summaryWindow }),
          getAdminDashboard(),
          getAdminAnalyticsSummary({ window: summaryWindow }),
          getAdminDeliverySummary(),
          getBranchReportingOverview({ start_date: today, end_date: today }),
          getAdminOperationsQueueSummary(),
          getStockSummary(),
          getHrSummary(),
          getReadyToLockBatchCount(),
        ]);

      setCanonical(canonicalPayload);
      setLegacy(legacyPayload);
      setAnalytics(analyticsPayload);
      setDeliverySummary(deliveryPayload);
      setTodayBranch(todayBranchPayload);
      setQueueSummary(queuePayload as QueueSummaryPayload);
      setStockSummary(stockPayload);
      setHrSummary(hrPayload);
      setReadyToLockBatches(readyToLockPayload);
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [summaryWindow]);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  const summary = canonical?.summary ?? legacy?.summary;
  const reconciliation = canonical?.reconciliation ?? legacy?.reconciliation;
  const settlementPosture = summary ? buildSettlementPosture(summary) : null;
  const reconciliationPosture = buildReconciliationPosture(reconciliation);
  const todayNet = todayBranch?.collections.net_amount ?? legacy?.collections?.today_net_amount ?? "0.00";
  const todayTransactions =
    todayBranch?.collections.count ?? legacy?.collections?.today_transaction_count ?? 0;
  const pendingEmiCount = summary?.pending_emis ?? legacy?.emi?.pending ?? 0;
  const pendingEmiAmount = summary?.total_pending_amount ?? legacy?.summary?.total_pending_amount ?? "0.00";
  const overdueCount = summary?.overdue_emis ?? legacy?.emi?.overdue ?? 0;
  const overdueAmount = summary?.overdue_amount ?? legacy?.summary?.overdue_amount ?? "0.00";
  const reconciliationFlags = reconciliation?.flagged_count ?? 0;
  const deliveryActions = deliverySummary
    ? deliverySummary.pending + deliverySummary.scheduled + deliverySummary.in_transit
    : 0;
  const nextDraw = legacy?.batches?.next_draw_batch;
  const openBatches = legacy?.batches?.open_batches ?? legacy?.operations?.open_batches ?? 0;
  const widgetStorageKey = "subidha:dashboard-widgets:admin:v1";
  const outstandingRaw = summary?.outstanding_amount ?? legacy?.financial?.total_outstanding ?? "0.00";
  const outstandingNum = toNumber(outstandingRaw);
  const analyticsOverview = analytics?.overview;
  const contractRows = analytics?.contract_performance.value_by_plan ?? [];
  const scheduleRows = analytics?.contract_performance.schedule_totals_by_plan ?? [];
  const paymentMethodRows = analytics?.payment_method_mix.rows ?? [];
  const directSalesCount =
    analyticsOverview?.direct_sales_window_count ?? analytics?.direct_sales_posture.summary.count ?? 0;
  const directSalesTotal =
    analyticsOverview?.direct_sales_window_gross_total ?? analytics?.direct_sales_posture.summary.gross_total ?? "0.00";
  const invoiceBalance = analyticsOverview?.invoice_balance ?? analytics?.invoice_document_posture.summary.invoice_balance ?? "0.00";
  const openLeadCount = analyticsOverview?.open_lead_count ?? analytics?.crm_customer_posture.leads.open_count ?? 0;
  const trackedInventoryItems = analytics?.inventory_movement_posture.tracked_item_count ?? 0;
  const recentPayments = legacy?.recent_activity ?? [];
  const pendingCommissionCount =
    analyticsOverview?.pending_commission_count ?? legacy?.commission_summary?.pending_count ?? 0;
  const pendingCommissionAmount =
    analyticsOverview?.pending_commission_amount ?? legacy?.commission_summary?.pending_commission ?? "0.00";
  const draftPayoutCount = analytics?.finance_posture.payout_batches.draft_count ?? 0;
  const lowStockCount = stockSummary?.results?.filter((item) => item.is_below_reorder).length ?? 0;
  const returnQueueCount =
    queueSummary?.results?.find((item) => item.key === "return_inspections_pending")?.count ?? 0;
  const refundQueueCount =
    queueSummary?.results?.find((item) => item.key === "deposit_refunds_pending")?.count ?? 0;
  const luckyDrawActions = (nextDraw?.days_until_draw ?? 0) <= 7 && nextDraw?.draw_date ? 1 : 0;

  const summaryWindowLabel =
    summaryWindow === "THIS_MONTH"
      ? "This month"
      : summaryWindow === "LAST_30_DAYS"
        ? "Last 30 days"
        : summaryWindow === "DEFAULT"
          ? "Default window"
          : "Custom window";

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
  const pendingTasksToday =
    attentionItems.length +
    overdueCount +
    reconciliationFlags +
    (hrSummary?.pending_leave_requests ?? 0) +
    (hrSummary?.pending_expense_claims ?? 0) +
    (hrSummary?.today_absent ?? 0);

  if (loading) {
    return (
      <PortalPage title="Admin Dashboard" subtitle="Operational summary and quick launch." breadcrumbs={[{ label: "Admin" }]}>
        <div className="space-y-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <DashboardGridSkeleton cards={8} />
          <LoadingBlock label="Loading admin command center..." />
        </div>
      </PortalPage>
    );
  }

  if (error) {
    return (
      <PortalPage
        title="Admin Dashboard"
        subtitle="Operational summary and quick launch."
        breadcrumbs={[{ label: "Admin" }]}
      >
        <ErrorState title="Unable to load executive dashboard" description={error} onRetry={() => void loadPage("initial")} />
      </PortalPage>
    );
  }

  if (operatorMode === "SIMPLE") {
    return (
      <PortalPage
        eyebrow="Admin"
        title="Admin Dashboard"
        subtitle="Live collection, EMI, batch, draw, and reconciliation signals for daily shop operations."
        helperNote={`This is the primary daily dashboard. Last updated ${formatDateTime(lastUpdatedAt)}. Dashboard numbers are read-only summaries from backend services.`}
        helperTone="info"
        breadcrumbs={[{ label: "Admin" }]}
        actions={[
          { href: ROUTES.admin.operations, label: "Open Operations", variant: "primary" },
          { href: ROUTES.admin.erp, label: "ERP Home", variant: "secondary" },
          { href: ROUTES.admin.bi, label: "BI", variant: "secondary" },
        ]}
      >
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[1.7rem] border border-[color-mix(in_oklab,var(--accent)_42%,white_58%)] bg-[linear-gradient(135deg,#ffffff_0%,#fffaf0_44%,#f8efe2_100%)] p-5 shadow-[0_24px_70px_-52px_rgba(76,45,24,0.7)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-[color-mix(in_oklab,var(--accent-foreground)_86%,black_14%)]">
                  <Clock3 className="h-4 w-4" />
                  Today: {formatDate(todayIso())}
                  <span className="rounded-full border border-[color-mix(in_oklab,var(--accent)_44%,white_56%)] bg-white/70 px-2 py-0.5 normal-case text-muted-foreground">
                    {pendingTasksToday} action signals
                  </span>
                </div>
                <h1 className="mt-3 text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
                  Daily Operator Dashboard
                  <span className="sr-only"> Executive Dashboard</span>
                </h1>
                <div className="mt-1 text-sm font-semibold text-[color-mix(in_oklab,var(--accent-foreground)_82%,black_18%)]">
                  Shop operations at a glance
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Prioritize collection, overdue EMI follow-up, batch readiness, lucky draw review, and reconciliation warnings without changing any financial records from this screen.
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  You have {pendingTasksToday} tasks pending today from live operations signals.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    { href: ROUTES.admin.operations, label: "Operations workspace" },
                    { href: ROUTES.admin.erp, label: "ERP workspace" },
                    { href: ROUTES.admin.bi, label: "BI control" },
                  ].map((shortcut) => (
                    <Link
                      key={shortcut.href}
                      href={shortcut.href}
                      className="rounded-full border border-[color-mix(in_oklab,var(--accent)_42%,white_58%)] bg-white px-3 py-1.5 text-sm font-semibold text-[color-mix(in_oklab,var(--accent-foreground)_86%,black_14%)] shadow-sm motion-safe:transition hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--accent)_8%,white_92%)]"
                    >
                      {shortcut.label}
                    </Link>
                  ))}
                </div>
              </div>
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
          </section>

          <MetricStrip
            items={[
              { label: "Today Collection", value: money(todayNet), helper: `${todayTransactions} txns`, href: ROUTES.admin.branchReporting },
              { label: "Active Outstanding", value: money(outstandingRaw), helper: "Active receivable only" },
              { label: "Due Today", value: String(pendingEmiCount), helper: money(pendingEmiAmount), href: ROUTES.admin.emisPending },
              { label: "Overdue", value: String(overdueCount), helper: money(overdueAmount), href: ROUTES.admin.emisOverdue },
              { label: "Pending Delivery", value: String(deliveryActions), helper: `${deliverySummary?.pending ?? 0} pending`, href: buildAdminDeliveriesRoute({ bucket: "PENDING" }) },
              { label: "Returns / Refunds", value: String(returnQueueCount + refundQueueCount), helper: `${returnQueueCount} returns · ${refundQueueCount} refunds`, href: ROUTES.admin.financeReversalControl },
              { label: "Low Stock", value: String(lowStockCount), helper: `${trackedInventoryItems} tracked`, href: ROUTES.admin.inventoryStockOnHand },
              { label: "Lucky Draw Actions", value: String(luckyDrawActions), helper: nextDraw?.batch_code ?? "No immediate draw", href: ROUTES.admin.luckyDraws },
              { label: "Open Batches", value: String(openBatches), helper: `Ready lock ${readyToLockBatches ?? 0}`, href: ROUTES.admin.batches },
              { label: "Reconciliation Alerts", value: String(reconciliationFlags), helper: reconciliationFlags > 0 ? "Needs review" : "Clear", href: ROUTES.admin.reconciliation },
            ]}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <QueueList
              rows={[
                { title: "Needs Collection", count: overdueCount, amount: money(overdueAmount), route: ROUTES.admin.emisOverdue },
                { title: "Needs Delivery", count: deliveryActions, route: buildAdminDeliveriesRoute({ bucket: "PENDING" }) },
                { title: "Needs Return / Refund", count: returnQueueCount + refundQueueCount, route: ROUTES.admin.financeReversalControl },
                { title: "Needs Reconciliation", count: reconciliationFlags, route: buildAdminReconciliationRoute({ flagged: true }) },
                { title: "Needs Stock Action", count: lowStockCount, route: ROUTES.admin.inventoryStockOnHand },
              ]}
            />
            <LedgerSummary
              rows={[
                { label: "Cash Collection", value: money(analytics?.payment_method_mix?.rows?.find((r) => r.method === "CASH")?.net_amount ?? "0.00"), route: ROUTES.admin.billingCashBook },
                { label: "UPI Collection", value: money(analytics?.payment_method_mix?.rows?.find((r) => r.method === "UPI")?.net_amount ?? "0.00"), route: ROUTES.admin.billingCashBook },
                { label: "Bank Collection", value: money(analytics?.payment_method_mix?.rows?.find((r) => r.method === "BANK")?.net_amount ?? "0.00"), route: ROUTES.admin.billingCashBook },
                { label: "Active Invoice Balance", value: money(invoiceBalance), helper: "Excludes history-only invoices", route: ROUTES.admin.billingInvoices },
              ]}
            />
          </div>

          <CommandSection
            title="Quick actions"
            description="Only real admin routes and guided workflows are shown. Payment posting remains server-controlled."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LaunchCard title="Create customer" description="Add a customer before enrollment." href={`${ROUTES.admin.customers}/create`} icon={<UserPlus className="h-5 w-5" />} />
              <LaunchCard title="Create subscription" description="Open Advance EMI contract creation." href={ROUTES.admin.subscriptionsAdvanceEmiCreate} icon={<Plus className="h-5 w-5" />} />
              <LaunchCard title="Collect payment" description="Open controlled collection workflow." href={`${ROUTES.admin.financeCollect}?workflow=advance-emi`} icon={<Banknote className="h-5 w-5" />} />
              <LaunchCard title="View overdue EMIs" description="Review overdue queue before follow-up." href={ROUTES.admin.emisOverdue} icon={<AlertTriangle className="h-5 w-5" />} />
              <LaunchCard title="Lock batch" description="Open ready-to-lock batches; lock from batch detail/control center." href={`${ROUTES.admin.batches}?status=READY_TO_LOCK`} icon={<LockKeyhole className="h-5 w-5" />} />
              <LaunchCard title="Run reconciliation" description="Open reconciliation workspace for controlled review." href={ROUTES.admin.reconciliation} icon={<ClipboardCheck className="h-5 w-5" />} />
              <LaunchCard title="View reports" description="Open reports center for live operational reports." href={ROUTES.admin.reports} icon={<BarChart3 className="h-5 w-5" />} />
              <LaunchCard title="Open operations" description="Resolve delivery, KYC, request, and support queues." href={ROUTES.admin.operationsCommandCenter} icon={<LayoutGrid className="h-5 w-5" />} />
              <LaunchCard title="Prepare delivery" description="Open the delivery workspace for pending handover and dispatch work." href={ROUTES.admin.deliveryWorkspace} icon={<Truck className="h-5 w-5" />} />
            </div>
          </CommandSection>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <CommandSection
              title="Urgent alerts"
              description="Overdue, reconciliation, and delivery signals from real dashboard services."
            >
              <div className="grid gap-3">
              {attentionItems.length === 0 ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">No urgent alerts in current snapshot.</div>
              ) : (
                attentionItems.map((item, index) => (
                  <Link key={`urgent-${item.title}-${index}`} href={item.href} className="rounded-xl border border-border bg-[var(--surface-card-elevated)] p-4 motion-safe:transition motion-safe:hover:-translate-y-0.5 hover:bg-[var(--surface-muted)]">
                    <div className="text-sm font-semibold text-foreground">{item.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
                  </Link>
                ))
              )}
            </div>
            </CommandSection>

            <CommandSection
              title="Recent payments"
              description="Latest payment activity from the admin dashboard payload. Reversed rows remain visibly distinct."
            >
              {recentPayments.length === 0 ? (
              <EmptyState
                title="No recent activity returned by the server."
                description="Payment activity will appear here when the current admin dashboard payload contains recent rows."
              />
              ) : (
                <div className="grid gap-2">
                  {recentPayments.slice(0, 5).map((payment, index) => (
                    <Link
                      key={`${payment.payment_id ?? index}-${payment.created_at ?? payment.payment_date ?? index}`}
                      href={payment.payment_id ? `${ROUTES.admin.payments}/${payment.payment_id}` : ROUTES.admin.payments}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border bg-white px-3 py-3 motion-safe:transition motion-safe:hover:-translate-y-0.5 hover:bg-[var(--surface-muted)]"
                    >
                      <div>
                        <div className="text-sm font-semibold text-foreground">{payment.customer_name ?? "Unknown customer"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{payment.subscription_number ?? "No subscription"} · {payment.method ?? "Method unavailable"}</span>
                          {payment.is_reversed ? <StatusBadge status="REVERSED" size="sm" /> : <StatusBadge status="PAID" size="sm" />}
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-foreground">{money(payment.amount ?? "0.00")}</div>
                    </Link>
                  ))}
                </div>
              )}
            </CommandSection>
          </div>

          <CommandSection
            title="Operational alerts"
            description="Partner, payout, delivery, and inventory alerts are shown only where existing endpoints returned data."
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LaunchCard title="Partner commission alerts" description={`${pendingCommissionCount} pending commission rows.`} href={ROUTES.admin.financeCommissions} icon={<Banknote className="h-5 w-5" />} meta={money(pendingCommissionAmount)} />
              <LaunchCard title="Payout batches" description={`${draftPayoutCount} draft payout batches from analytics.`} href={ROUTES.admin.financePayoutBatches} icon={<ReceiptText className="h-5 w-5" />} meta="Partner payouts" />
              <LaunchCard title="Delivery workload" description={`${deliveryActions} pending, scheduled, or in-transit delivery actions.`} href={buildAdminDeliveriesRoute({ bucket: "PENDING" })} icon={<Truck className="h-5 w-5" />} meta={`${deliverySummary?.pending ?? 0} pending`} />
              <LaunchCard title="Inventory alerts" description={`${lowStockCount} stock rows below reorder level.`} href={ROUTES.admin.inventoryStockOnHand} icon={<Package className="h-5 w-5" />} meta={`${trackedInventoryItems} tracked items`} />
            </div>
          </CommandSection>
        </div>
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
            <span className="text-xs sm:text-sm">
              Window: {summaryWindowLabel} · Today: {formatDate(todayIso())}
            </span>
            <ToggleGroup
              type="single"
              value={summaryWindow}
              onValueChange={(value: string) => {
                if (value === "THIS_MONTH" || value === "LAST_30_DAYS" || value === "DEFAULT") {
                  setSummaryWindow(value as DashboardWindowPreset);
                }
              }}
              aria-label="Executive dashboard summary window"
              className="border-border bg-[var(--surface-muted)]/80"
            >
              <ToggleGroupItem value="THIS_MONTH">This month</ToggleGroupItem>
              <ToggleGroupItem value="LAST_30_DAYS">Last 30 days</ToggleGroupItem>
              <ToggleGroupItem value="DEFAULT">Default</ToggleGroupItem>
            </ToggleGroup>
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
              order: [
                "quick-actions",
                "urgent-attention",
                "settlement-posture",
                "finance-accounting",
                "contract-performance",
                "crm-customer",
                "launch-points",
              ],
              pinned: ["quick-actions", "urgent-attention"],
            },
            {
              id: "finance-watch",
              label: "Finance watch",
              description: "Keep settlement and attention widgets dominant for close/reconciliation windows.",
              order: [
                "settlement-posture",
                "finance-accounting",
                "urgent-attention",
                "contract-performance",
                "crm-customer",
                "launch-points",
                "quick-actions",
              ],
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
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <ActionButton variant="primary" onClick={() => openWorkflow("admin.createSubscription")}>
                    New Advance EMI Contract
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.createSubscription")}>
                    New Rent Contract
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.createSubscription")}>
                    New Lease Contract
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.createDirectSale")}>
                    New Direct Sale
                  </ActionButton>
                  <ActionButton variant="secondary" onClick={() => openWorkflow("admin.collectPayment")}>
                    Collect Payment
                  </ActionButton>
                  <ActionButton variant="secondary" href={ROUTES.admin.deliveries}>
                    Prepare Delivery
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
                    href={ROUTES.admin.financeCollect}
                    icon={<Banknote className="h-5 w-5" />}
                  />
                </div>
              ),
            },
            {
              id: "contract-performance",
              title: "Contract Performance",
              subtitle: "Advance EMI, rent, and lease contract posture from subscription and schedule records.",
              group: "operational",
              content:
                contractRows.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No contract rows returned by the analytics aggregate for this window.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {contractRows.map((row) => {
                      const schedule = scheduleRows.find((item) => item.plan_type === row.plan_type);
                      return (
                        <LaunchCard
                          key={row.plan_type}
                          title={`${row.plan_type} Contracts`}
                          description={`${row.active_count} active · ${row.completed_count} completed · ${row.defaulted_count} defaulted`}
                          href={`${ROUTES.admin.subscriptions}?plan_type=${row.plan_type}`}
                          icon={<FileText className="h-5 w-5" />}
                          meta={`${money(row.contract_value)} value · ${schedule?.pending_count ?? 0} due rows`}
                          badge="Contract"
                        />
                      );
                    })}
                  </div>
                ),
            },
            {
              id: "finance-accounting",
              title: "Finance & Accounting",
              subtitle: "Collections, invoice balance, receipts, and ledger-facing finance posture.",
              group: "core",
              content: (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Window Collections"
                    value={money(analyticsOverview?.window_net_collections ?? todayNet)}
                    subtext={`${analyticsOverview?.window_active_collection_count ?? 0} active receipt rows`}
                    tone="success"
                    href={ROUTES.admin.payments}
                    icon={<Wallet className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Invoice Balance"
                    value={money(invoiceBalance)}
                    subtext={`${analytics?.invoice_document_posture.summary.invoice_count ?? 0} invoices · ${analytics?.invoice_document_posture.summary.receipt_count ?? 0} receipts`}
                    tone={toNumber(invoiceBalance) > 0 ? "warning" : "success"}
                    href={ROUTES.admin.billingInvoices}
                    icon={<ReceiptText className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Cash / UPI / Bank"
                    value={money(analytics?.payment_method_mix.summary.total_net_amount ?? "0.00")}
                    subtext={paymentMethodRows.map((row) => `${row.method}: ${money(row.net_amount)}`).join(" · ") || "No method rows"}
                    href={ROUTES.admin.billingCashBook}
                    icon={<Landmark className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Pending Commission"
                    value={money(analyticsOverview?.pending_commission_amount ?? "0.00")}
                    subtext={`${analyticsOverview?.pending_commission_count ?? 0} commission rows`}
                    tone={(analyticsOverview?.pending_commission_count ?? 0) > 0 ? "warning" : "success"}
                    href={ROUTES.admin.financeCommissions}
                    icon={<Banknote className="h-5 w-5" />}
                  />
                </div>
              ),
            },
            {
              id: "crm-customer",
              title: "CRM & Customer Activity",
              subtitle: "Lead pipeline and customer readiness, kept separate from posted financial flows.",
              group: "operational",
              content: (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Open Leads"
                    value={String(openLeadCount)}
                    subtext={`${analytics?.crm_customer_posture.leads.converted_count ?? 0} converted in window`}
                    href={ROUTES.admin.leads}
                    icon={<Users className="h-5 w-5" />}
                  />
                  <StatCard
                    label="New Customers"
                    value={String(analytics?.crm_customer_posture.customers.new_count ?? 0)}
                    subtext={`${analytics?.crm_customer_posture.customers.kyc_pending_count ?? 0} KYC pending`}
                    href={ROUTES.admin.customers}
                    icon={<Users className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Direct Sales"
                    value={String(directSalesCount)}
                    subtext={money(directSalesTotal)}
                    href={ROUTES.admin.billingDirectSales}
                    icon={<ShoppingCart className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Inventory Movement"
                    value={String(analytics?.inventory_movement_posture.movement_summary.count ?? 0)}
                    subtext={`${trackedInventoryItems} tracked items`}
                    href={ROUTES.admin.inventoryMovements}
                    icon={<Package className="h-5 w-5" />}
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
              label="Direct sales"
              value={money(directSalesTotal)}
              subtext={`${directSalesCount} direct sale rows this month`}
              href={ROUTES.admin.billingDirectSales}
              icon={<ShoppingCart className="h-5 w-5" />}
              trend="neutral"
              trendValue="Retail"
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
        <PageSection>
          <h2 className="text-sm font-semibold text-foreground">Request & Approval Queues</h2>
          <p className="mt-1 text-sm text-muted-foreground">Live admin queues with severity and deep links.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REQUIRED_QUEUE_KEYS.map((key) => {
              const row = (queueSummary?.results ?? []).find((item) => item.key === key);
              const isLowStock = key === "low_stock_alerts";
              const lowStockCount =
                stockSummary?.results?.filter((item) => item.is_below_reorder).length ?? 0;
              const href = isLowStock
                ? ROUTES.admin.inventoryStockOnHand
                : row?.detail_url || ROUTES.admin.operationsCommandCenter;
              const count = isLowStock ? lowStockCount : row?.count ?? 0;
              const severity = isLowStock
                ? lowStockCount > 0
                  ? "HIGH"
                  : "INFO"
                : row?.severity ?? "INFO";
              return (
                <div key={key} className="rounded-[1.35rem] border border-border bg-[var(--surface-card-elevated)] p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-foreground">{QUEUE_LABELS[key] || key}</div>
                    <span className="rounded-full border border-border/80 bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {severity}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Count: {count}
                    {row?.oldest_pending_date ? ` • Oldest: ${row.oldest_pending_date}` : ""}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <ActionButton href={href} size="sm" variant="secondary">
                      Open Queue
                    </ActionButton>
                    <ActionButton href={href} size="sm" variant="outline">
                      Take Action
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        </PageSection>

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
                title="ERP Home"
                description="Unified launchpad for CRM, sales, finance, inventory, delivery, and partner workflows."
                href={ROUTES.admin.erp}
                icon={<LayoutGrid className="h-5 w-5" />}
                badge="Core"
              />
              <LaunchCard
                title="Operations"
                description="Queues for collections, support, delivery, and onboarding."
                href={ROUTES.admin.operations}
                icon={<ClipboardCheck className="h-5 w-5" />}
                meta={`${overdueCount + deliveryActions + reconciliationFlags} active signals`}
                badge="Core"
              />
              <LaunchCard
                title="Staff & HR"
                description="Staff register, attendance, leave, expenses, and payroll posture."
                href={ROUTES.admin.hr}
                icon={<Users className="h-5 w-5" />}
                meta={
                  hrSummary
                    ? `${hrSummary.pending_leave_requests} leave · ${hrSummary.pending_expense_claims} expenses`
                    : "HR summary"
                }
                badge="HR"
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
                title="Accounting Control Center"
                description="Global accounting KPI control, liability posture, and reconciliation command."
                href="/admin/accounting/control-center"
                icon={<Landmark className="h-5 w-5" />}
                badge="Phase 5"
              />
              <LaunchCard
                title="Operations Command Center"
                description="Cross-module queue control for contracts, delivery, returns, KYC, and partner follow-up."
                href="/admin/operations/command-center"
                icon={<ClipboardCheck className="h-5 w-5" />}
                badge="Phase 5"
              />
              <LaunchCard
                title="Reports"
                description="Performance, exposure, and operational health from live data."
                href={ROUTES.admin.reports}
                icon={<BarChart3 className="h-5 w-5" />}
                badge="Analytics"
              />
              <LaunchCard
                title="BI Control Center"
                description="Read-only trends and posture charts."
                href={ROUTES.admin.bi}
                icon={<BarChart3 className="h-5 w-5" />}
                badge="BI"
              />
              <LaunchCard
                title="Record payment"
                description="Open payment collection with the same server posting rules."
                href={ROUTES.admin.financeCollect}
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
            <MoreLink href="/admin/accounting/control-center" label="Accounting control center" />
            <MoreLink href="/admin/operations/command-center" label="Operations command center" />
            <MoreLink href={ROUTES.admin.billingDirectSales} label="Direct sales" />
            <MoreLink href={ROUTES.admin.hr} label="Staff & HR" />
            <MoreLink href={ROUTES.admin.bi} label="BI control center" />
            <MoreLink href={ROUTES.admin.settingsBusinessSetup} label="Setup & readiness" />
          </div>
        </PageSection>
      </div>
    </PortalPage>
  );
}
