"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Factory,
  PackageSearch,
  Percent,
  RefreshCw,
  ShoppingCart,
  ShieldAlert,
  Siren,
  Truck,
  Users,
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
import {
  getBranchReportingOverview,
  type BranchReportingOverview,
} from "@/services/branch-control";
import { getAdminDashboard } from "@/services/admin";
import {
  listExpenseClaims,
  listPurchaseBills,
  listSalarySheets,
  type AccountingPaginatedResponse,
  type AccountingPurchaseBill,
  type EmployeeExpenseClaim,
  type SalarySheet,
} from "@/services/accounting";
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
import { getStockSummary, type StockSummaryRow } from "@/services/inventory";
import {
  getServiceDeskOverview,
  listServiceDeskCases,
  type ServiceDeskOverview,
} from "@/services/service-desk";
import { listReminders } from "@/services/reminders";
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
type StockSummaryPayload = Awaited<ReturnType<typeof getStockSummary>>;
type PurchaseBillListPayload = AccountingPaginatedResponse<AccountingPurchaseBill>;
type ExpenseClaimListPayload = AccountingPaginatedResponse<EmployeeExpenseClaim>;
type SalarySheetListPayload = AccountingPaginatedResponse<SalarySheet>;
type ServiceDeskCasePayload = Awaited<ReturnType<typeof listServiceDeskCases>>;
type ReminderQueuePayload = Awaited<ReturnType<typeof listReminders>>;

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

function formatLocalDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveWindowDateRange(
  preset: DashboardWindowPreset,
  customStartDate: string,
  customEndDate: string
): { start: string | undefined; end: string | undefined; label: string } {
  const today = new Date();
  const todayLabel = formatLocalDate(today);

  if (preset === "CUSTOM") {
    return {
      start: customStartDate || undefined,
      end: customEndDate || undefined,
      label:
        customStartDate && customEndDate
          ? `${customStartDate} → ${customEndDate}`
          : "Custom range",
    };
  }

  if (preset === "THIS_MONTH") {
    const start = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), 1));
    return { start, end: todayLabel, label: `This month (${start} → ${todayLabel})` };
  }

  if (preset === "LAST_30_DAYS") {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);
    const start = formatLocalDate(startDate);
    return { start, end: todayLabel, label: `Last 30 days (${start} → ${todayLabel})` };
  }

  return { start: undefined, end: undefined, label: "All time" };
}

function toNumber(value?: string | number | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatQuantity(value?: string | number | null): string {
  return toNumber(value).toFixed(2);
}

function toneClasses(tone: "default" | "warning" | "success" | "info" | "danger") {
  if (tone === "warning") return "border-amber-200 bg-amber-50/90 text-amber-900";
  if (tone === "success") return "border-emerald-200 bg-emerald-50/90 text-emerald-900";
  if (tone === "danger") return "border-red-200 bg-red-50/90 text-red-900";
  if (tone === "info") return "border-sky-200 bg-sky-50/90 text-sky-900";
  return "border-border bg-[var(--surface-muted)] text-foreground";
}

function DashboardKpiCard({
  label,
  value,
  detail,
  href,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: ReactNode;
  tone?: "default" | "warning" | "success" | "info" | "danger";
}) {
  return (
    <Link
      href={href}
      className={`group rounded-[1.6rem] border p-5 shadow-[0_18px_45px_-36px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_55px_-38px_rgba(15,23,42,0.6)] ${toneClasses(
        tone
      )}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/70 bg-white/75 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
          {icon}
        </div>
        <ArrowRight className="h-4 w-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
      </div>
      <div className="enterprise-eyebrow mt-4 opacity-75">
        {label}
      </div>
      <div className="enterprise-metric mt-2">{value}</div>
      <p className="mt-2 text-sm leading-6 opacity-80">{detail}</p>
    </Link>
  );
}

function HorizontalBar({
  label,
  value,
  total,
  meta,
  tone = "info",
}: {
  label: string;
  value: number;
  total: number;
  meta: string;
  tone?: "default" | "warning" | "success" | "info" | "danger";
}) {
  const fillClass =
    tone === "warning"
      ? "bg-amber-500"
      : tone === "success"
      ? "bg-emerald-500"
      : tone === "danger"
      ? "bg-red-500"
      : tone === "default"
      ? "bg-slate-500"
      : "bg-primary";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-xs font-semibold text-muted-foreground">{meta}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${asPercent(value, total)}%` }}
        />
      </div>
    </div>
  );
}

function PaymentModeSplit({
  cash,
  bank,
  upi,
}: {
  cash: number;
  bank: number;
  upi: number;
}) {
  const total = cash + bank + upi;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <div className="bg-emerald-500" style={{ width: `${asPercent(cash, total)}%` }} />
        <div className="bg-primary" style={{ width: `${asPercent(bank, total)}%` }} />
        <div className="bg-amber-500" style={{ width: `${asPercent(upi, total)}%` }} />
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Cash {money(cash)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          Bank {money(bank)}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          UPI {money(upi)}
        </span>
      </div>
    </div>
  );
}

function CockpitPanel({
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="surface-panel-elevated rounded-[1.7rem] border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="enterprise-section-title text-base">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {actionHref && actionLabel ? (
          <ActionButton href={actionHref} variant="secondary" className="h-9 px-3 text-xs">
            {actionLabel}
          </ActionButton>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function AttentionRow({
  title,
  detail,
  value,
  href,
  tone,
}: {
  title: string;
  detail: string;
  value: string;
  href: string;
  tone: "default" | "warning" | "success" | "info" | "danger";
}) {
  return (
    <Link
      href={href}
      className="grid gap-3 rounded-2xl border border-border bg-[var(--surface-card-elevated)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
      <span
        className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold ${toneClasses(
          tone
        )}`}
      >
        {value}
      </span>
    </Link>
  );
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
      ? "border-amber-200 bg-amber-50/88"
      : tone === "success"
      ? "border-emerald-200 bg-emerald-50/88"
      : tone === "info"
      ? "border-sky-200 bg-sky-50/88"
      : "border-border bg-[var(--surface-card-elevated)]";

  return (
    <article
      className={`rounded-[1.5rem] border p-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.44)] ${toneClassName}`}
    >
      <div className="enterprise-eyebrow">
        {eyebrow}
      </div>
      <h3 className="mt-2 text-base font-semibold text-foreground">{title}</h3>
      <div className="enterprise-metric mt-3 text-foreground">
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
  const [branchOverview, setBranchOverview] =
    useState<BranchReportingOverview | null>(null);
  const [branchBreakdowns, setBranchBreakdowns] = useState<
    BranchReportingOverview[]
  >([]);
  const [stockSummary, setStockSummary] = useState<StockSummaryPayload | null>(null);
  const [purchaseDrafts, setPurchaseDrafts] =
    useState<PurchaseBillListPayload | null>(null);
  const [purchaseApproved, setPurchaseApproved] =
    useState<PurchaseBillListPayload | null>(null);
  const [salaryPayables, setSalaryPayables] =
    useState<SalarySheetListPayload | null>(null);
  const [expenseClaimQueue, setExpenseClaimQueue] =
    useState<ExpenseClaimListPayload | null>(null);
  const [serviceDeskOverview, setServiceDeskOverview] =
    useState<ServiceDeskOverview | null>(null);
  const [openServiceCases, setOpenServiceCases] =
    useState<ServiceDeskCasePayload | null>(null);
  const [pendingReminderQueue, setPendingReminderQueue] =
    useState<ReminderQueuePayload | null>(null);
  const [failedReminderQueue, setFailedReminderQueue] =
    useState<ReminderQueuePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowPreset, setWindowPreset] =
    useState<DashboardWindowPreset>("THIS_MONTH");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [todayBranchOverview, setTodayBranchOverview] =
    useState<BranchReportingOverview | null>(null);
  const branchWindow = useMemo(
    () => resolveWindowDateRange(windowPreset, startDate, endDate),
    [endDate, startDate, windowPreset]
  );
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
  const branchReportingQuery = useMemo(
    () => ({
      branch_id: selectedBranchId || undefined,
      start_date: branchWindow.start,
      end_date: branchWindow.end,
    }),
    [branchWindow.end, branchWindow.start, selectedBranchId]
  );
  const todayBranchReportingQuery = useMemo(() => {
    const today = formatLocalDate(new Date());
    return {
      branch_id: selectedBranchId || undefined,
      start_date: today,
      end_date: today,
    };
  }, [selectedBranchId]);
  const branchScopedQuery = useMemo(
    () => ({
      branch: selectedBranchId || undefined,
      page_size: 1,
    }),
    [selectedBranchId]
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
        branchOverviewPayload,
        todayBranchOverviewPayload,
        stockSummaryPayload,
        purchaseDraftPayload,
        purchaseApprovedPayload,
        salaryPayablePayload,
        expenseClaimPayload,
        serviceDeskOverviewPayload,
        openServiceCasePayload,
        pendingReminderPayload,
        failedReminderPayload,
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
        listAdminLeads({}),
        listSubscriptionRequests("admin", {
          status: "SUBMITTED",
          page: 1,
          pageSize: 1,
        }),
        getBranchReportingOverview(branchReportingQuery),
        getBranchReportingOverview(todayBranchReportingQuery),
        getStockSummary({ branch: selectedBranchId || undefined }),
        listPurchaseBills({
          ...branchScopedQuery,
          status: "DRAFT",
        }),
        listPurchaseBills({
          ...branchScopedQuery,
          status: "APPROVED",
        }),
        listSalarySheets({
          ...branchScopedQuery,
          status: "POSTED",
        }),
        listExpenseClaims({
          ...branchScopedQuery,
          status: "POSTED",
        }),
        getServiceDeskOverview(),
        listServiceDeskCases({
          ...branchScopedQuery,
          status: "OPEN",
        }),
        listReminders({
          status: "PENDING",
          page_size: 1,
        }),
        listReminders({
          status: "FAILED",
          page_size: 1,
        }),
      ]);
      const branchMetricPayloads = selectedBranchId
        ? [branchOverviewPayload]
        : await Promise.all(
            branchOverviewPayload.branches
              .filter((branch) => branch.status === "ACTIVE")
              .slice(0, 6)
              .map((branch) =>
                getBranchReportingOverview({
                  ...branchReportingQuery,
                  branch_id: branch.id,
                })
              )
          );

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
      setBranchOverview(branchOverviewPayload);
      setTodayBranchOverview(todayBranchOverviewPayload);
      setBranchBreakdowns(branchMetricPayloads);
      setStockSummary(stockSummaryPayload);
      setPurchaseDrafts(purchaseDraftPayload);
      setPurchaseApproved(purchaseApprovedPayload);
      setSalaryPayables(salaryPayablePayload);
      setExpenseClaimQueue(expenseClaimPayload);
      setServiceDeskOverview(serviceDeskOverviewPayload);
      setOpenServiceCases(openServiceCasePayload);
      setPendingReminderQueue(pendingReminderPayload);
      setFailedReminderQueue(failedReminderPayload);
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
        setBranchOverview(null);
        setTodayBranchOverview(null);
        setBranchBreakdowns([]);
        setStockSummary(null);
        setPurchaseDrafts(null);
        setPurchaseApproved(null);
        setSalaryPayables(null);
        setExpenseClaimQueue(null);
        setServiceDeskOverview(null);
        setOpenServiceCases(null);
        setPendingReminderQueue(null);
        setFailedReminderQueue(null);
      }
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [
    branchReportingQuery,
    branchScopedQuery,
    dashboardQuery,
    selectedBranchId,
    todayBranchReportingQuery,
  ]);

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
  const leadActionCount =
    (leadQueue?.summary.new ?? 0) +
    (leadQueue?.summary.in_progress ?? 0) +
    (leadQueue?.summary.contacted ?? 0);
  const onboardingActionCount = (requestQueue?.count ?? 0) + leadActionCount;
  const selectedBranch = selectedBranchId
    ? branchOverview?.branches.find(
        (branch) => String(branch.id) === selectedBranchId
      )
    : null;
  const selectedBranchLabel = selectedBranch
    ? `${selectedBranch.code} · ${selectedBranch.name}`
    : "All branches";
  const cashTotal = toNumber(
    branchOverview?.collections.cash_net_total ?? branchOverview?.collections.cash_total
  );
  const bankTotal = toNumber(
    branchOverview?.collections.bank_net_total ?? branchOverview?.collections.bank_total
  );
  const upiTotal = toNumber(
    branchOverview?.collections.upi_net_total ?? branchOverview?.collections.upi_total
  );
  const todayCashTotal = toNumber(
    todayBranchOverview?.collections.cash_net_total ??
      todayBranchOverview?.collections.cash_total
  );
  const todayBankTotal = toNumber(
    todayBranchOverview?.collections.bank_net_total ??
      todayBranchOverview?.collections.bank_total
  );
  const todayUpiTotal = toNumber(
    todayBranchOverview?.collections.upi_net_total ??
      todayBranchOverview?.collections.upi_total
  );
  const todayNetCollections =
    todayBranchOverview?.collections.net_amount ??
    legacy?.collections?.today_net_amount ??
    "0.00";
  const windowNetCollections =
    branchOverview?.collections.net_amount ?? branchOverview?.collections.gross_amount;
  const stockRows = stockSummary?.results ?? [];
  const lowStockRows = stockRows.filter((row) => row.is_below_reorder);
  const rawMaterialLowRows = lowStockRows.filter(
    (row) => row.stock_item_type === "RAW_MATERIAL"
  );
  const purchaseActionCount =
    (purchaseDrafts?.count ?? 0) + (purchaseApproved?.count ?? 0);
  const payrollActionCount =
    (salaryPayables?.count ?? 0) + (expenseClaimQueue?.count ?? 0);
  const serviceDeskActionCount =
    openServiceCases?.count ?? serviceDeskOverview?.summary.open_count ?? 0;
  const reminderActionCount =
    (pendingReminderQueue?.count ?? 0) + (failedReminderQueue?.count ?? 0);
  const customerIssueActionCount = serviceDeskActionCount + supportActionCount;
  const attentionQueueCount =
    (summary?.overdue_emis ?? 0) +
    (reconciliationSurface?.flagged_count ?? 0) +
    deliveryActionCount +
    customerIssueActionCount +
    purchaseActionCount +
    payrollActionCount +
    reminderActionCount +
    onboardingActionCount;
  const activeContracts =
    branchOverview?.subscriptions.active_contracts ??
    summary?.active_subscriptions ??
    0;
  const portfolioMix = legacy?.portfolio_mix ?? null;
  const portfolioTotal = Math.max(
    (portfolioMix?.emi ?? 0) + (portfolioMix?.rent ?? 0) + (portfolioMix?.lease ?? 0),
    1
  );
  const leadPipeline = legacy?.crm?.lead_pipeline ?? leadQueue?.summary ?? null;
  const leadPipelineCounts = {
    new: Number(leadPipeline?.new ?? 0),
    in_progress: Number(leadPipeline?.in_progress ?? 0),
    contacted: Number(leadPipeline?.contacted ?? 0),
    converted: Number(leadPipeline?.converted ?? 0),
    closed: Number(leadPipeline?.closed ?? 0),
  };
  const recentLeads = leadQueue?.results ?? [];
  const overdueEmiCount =
    branchOverview?.subscriptions.overdue_emi_count ?? summary?.overdue_emis ?? 0;
  const collectionTrendRows = Array.from(
    paymentRows
      .slice()
      .reverse()
      .reduce((rows, row) => {
        const key = formatDate(row.payment_date || row.created_at);
        rows.set(key, (rows.get(key) ?? 0) + toNumber(row.amount));
        return rows;
      }, new Map<string, number>())
  ).slice(-6);
  const collectionTrendMax = Math.max(
    ...collectionTrendRows.map(([, amount]) => amount),
    1
  );
  const branchCollectionMax = Math.max(
    ...branchBreakdowns.map((item) =>
      toNumber(item.collections.net_amount ?? item.collections.gross_amount)
    ),
    1
  );

  return (
    <PortalPage
      title="Admin Dashboard"
      subtitle="Executive operating console for finance, collections, CRM, subscriptions (EMI / RENT / LEASE), direct sales, inventory, branches, staff, and governance."
      helperNote="All sections below use live module data only. No operational KPI here is synthetic or detached from source modules."
      helperTone="info"
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        {
          href: ROUTES.admin.financeCollect,
          label: "Collect Payment",
          variant: "primary",
        },
        {
          href: ROUTES.admin.finance,
          label: "Finance",
          variant: "secondary",
        },
        {
          href: ROUTES.admin.crm,
          label: "CRM",
          variant: "secondary",
        },
        {
          href: flaggedPaymentQueueHref,
          label: "Reconciliation Flags",
          variant: "secondary",
        },
      ]}
      stats={
        legacy && summary
          ? [
              {
                label: "Today collections",
                value: money(todayNetCollections),
                tone: "success",
              },
              {
                label: "Window collections",
                value: money(windowNetCollections),
                tone: "info",
              },
              {
                label: "Outstanding receivables",
                value: money(summary.outstanding_amount),
                tone: (toNumber(summary.outstanding_amount) ?? 0) > 0 ? "warning" : "success",
              },
              {
                label: "Overdue amount",
                value: money(summary.overdue_amount),
                tone:
                  (toNumber(summary.overdue_amount) ?? 0) > 0
                    ? "warning"
                    : "success",
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
        <div className="surface-panel-elevated flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
          <label className="min-w-[240px] flex-1 text-sm text-muted-foreground md:max-w-sm">
            <span className="enterprise-eyebrow mb-2 block">
              Branch scope
            </span>
            <select
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              disabled={loading || refreshing}
              className="h-11 w-full rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">All branches</option>
              {(branchOverview?.branches ?? []).map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.code} · {branch.name}
                </option>
              ))}
            </select>
          </label>
          <div className="text-sm text-muted-foreground">
            <div className="enterprise-eyebrow">
              Active scope
            </div>
            <div className="mt-2 font-semibold text-foreground">{selectedBranchLabel}</div>
          </div>
          <ActionButton
            variant="outline"
            onClick={() => void loadDashboard("refresh")}
            disabled={refreshing || loading}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
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
              <DashboardKpiCard
                label="Collections (Window scope)"
                value={money(windowNetCollections)}
                detail={`${branchOverview?.collections.active_count ?? branchOverview?.collections.count ?? 0} active · ${branchOverview?.collections.reversed_count ?? 0} reversed · ${branchWindow.label} · ${selectedBranchLabel}`}
                href={ROUTES.admin.branchReporting}
                tone="success"
                icon={<Banknote className="h-5 w-5 text-emerald-700" />}
              />
              <DashboardKpiCard
                label="Active contracts"
                value={String(activeContracts)}
                detail={`Portfolio includes EMI / RENT / LEASE. ${overdueEmiCount} overdue EMI rows in the same branch posture.`}
                href={ROUTES.admin.subscriptions}
                tone={overdueEmiCount > 0 ? "warning" : "info"}
                icon={<Users className="h-5 w-5 text-sky-700" />}
              />
              <DashboardKpiCard
                label="Immediate Action Queue"
                value={String(attentionQueueCount)}
                detail="Overdue EMI, finance flags, reminders, service, procurement, payroll, and onboarding exceptions"
                href={overdueFollowUpHref}
                tone={attentionQueueCount > 0 ? "warning" : "success"}
                icon={<Siren className="h-5 w-5 text-amber-700" />}
              />
              <DashboardKpiCard
                label="Stock alert queue"
                value={String(lowStockRows.length)}
                detail={`${rawMaterialLowRows.length} raw-material alert(s) from real inventory summary`}
                href={ROUTES.admin.inventoryStockOnHand}
                tone={lowStockRows.length > 0 ? "warning" : "success"}
                icon={<PackageSearch className="h-5 w-5 text-slate-700" />}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <CockpitPanel
                title="Needs Immediate Action"
                description="Priority exceptions are listed first so operations teams can resolve overdue, reconciliation, reminder, service, and back-office queues before secondary analytics."
                actionHref={overdueFollowUpHref}
                actionLabel="Open overdue queue"
              >
                <div className="space-y-3">
                  <AttentionRow
                    title="Overdue EMI follow-up"
                    detail={`${money(branchOverview?.subscriptions.overdue_emi_amount ?? summary.overdue_amount)} currently overdue.`}
                    value={String(overdueEmiCount)}
                    href={overdueFollowUpHref}
                    tone={overdueEmiCount > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Finance reconciliation flags"
                    detail="Controlled review queue for mismatched payment/subscription rows."
                    value={String(reconciliationSurface?.flagged_count ?? 0)}
                    href={flaggedPaymentQueueHref}
                    tone={(reconciliationSurface?.flagged_count ?? 0) > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Reminder dispatch backlog"
                    detail={`${pendingReminderQueue?.count ?? 0} pending and ${failedReminderQueue?.count ?? 0} failed reminder(s) need operator action.`}
                    value={String(reminderActionCount)}
                    href={ROUTES.admin.reminders}
                    tone={reminderActionCount > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Delivery queue"
                    detail="Pending, scheduled, and in-transit deliveries that still need action."
                    value={String(deliveryActionCount)}
                    href={deliveryQueueHref}
                    tone={deliveryActionCount > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Service desk / complaint queue"
                    detail={`${serviceDeskOverview?.summary.finance_pending_count ?? 0} finance-pending and ${serviceDeskOverview?.summary.stock_pending_count ?? 0} stock-pending service cases.`}
                    value={String(customerIssueActionCount)}
                    href={ROUTES.admin.serviceDesk}
                    tone={customerIssueActionCount > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Purchase and payroll posture"
                    detail={`${purchaseActionCount} purchase bill(s), ${payrollActionCount} salary/reimbursement item(s) need controlled follow-up.`}
                    value={String(purchaseActionCount + payrollActionCount)}
                    href={ROUTES.admin.accounting}
                    tone={purchaseActionCount + payrollActionCount > 0 ? "warning" : "success"}
                  />
                  <AttentionRow
                    title="Lead and onboarding follow-up"
                    detail={`${requestQueue?.count ?? 0} subscription request(s) and ${leadActionCount} open lead(s) need conversion or closure.`}
                    value={String(onboardingActionCount)}
                    href={onboardingRequestsHref}
                    tone={onboardingActionCount > 0 ? "warning" : "success"}
                  />
                </div>
              </CockpitPanel>

              <CockpitPanel
                title="Collections cockpit"
                description="Branch and payment-mode posture from actual payment rows in branch-control reporting."
                actionHref={ROUTES.admin.branchReporting}
                actionLabel="Open branch report"
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Payment mode split (window net)
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">
                      {money(cashTotal + bankTotal + upiTotal)}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Net totals for the active window scope (reversed rows excluded when available).
                    </p>
                    {branchOverview?.collections.reversed_amount ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Reversed amount in window: {money(branchOverview.collections.reversed_amount)} ({branchOverview.collections.reversed_count ?? 0} row(s)).
                      </p>
                    ) : null}
                    <div className="mt-5">
                      <PaymentModeSplit cash={cashTotal} bank={bankTotal} upi={upiTotal} />
                    </div>

                    <div className="mt-6 rounded-2xl border border-white/70 bg-white/75 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Today (net)
                      </div>
                      <div className="mt-2 text-xl font-semibold text-slate-950">
                        {money(todayCashTotal + todayBankTotal + todayUpiTotal)}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Snapshot for {formatLocalDate(new Date())} in the same branch scope.
                      </p>
                      <div className="mt-4">
                        <PaymentModeSplit cash={todayCashTotal} bank={todayBankTotal} upi={todayUpiTotal} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Branch-wise collections
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Existing branch reporting endpoint sampled per active branch.
                        </p>
                      </div>
                      <Building2 className="h-5 w-5 text-slate-400" />
                    </div>
                    {branchBreakdowns.length > 0 ? (
                      <div className="space-y-3">
                        {branchBreakdowns.map((branchPayload) => (
                          <HorizontalBar
                            key={branchPayload.branch?.id ?? "all"}
                            label={
                              branchPayload.branch
                                ? `${branchPayload.branch.code} · ${branchPayload.branch.name}`
                                : "All branches"
                            }
                            value={toNumber(
                              branchPayload.collections.net_amount ??
                                branchPayload.collections.gross_amount
                            )}
                            total={branchCollectionMax}
                            meta={money(
                              branchPayload.collections.net_amount ??
                                branchPayload.collections.gross_amount
                            )}
                            tone="success"
                          />
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        title="No branch collection rows"
                        description="Branch reporting did not return active branch rows for this scope."
                      />
                    )}
                  </div>
                </div>
              </CockpitPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <CockpitPanel
                title="Portfolio mix"
                description="Business mix across EMI / RENT / LEASE subscriptions plus direct sales signals. Zero counts are shown honestly when a channel has no data yet."
                actionHref={ROUTES.admin.subscriptions}
                actionLabel="Open subscriptions"
              >
                <div className="space-y-5">
                  <HorizontalBar
                    label="EMI subscriptions"
                    value={portfolioMix?.emi ?? 0}
                    total={portfolioTotal}
                    meta={`${portfolioMix?.emi ?? 0} total`}
                    tone="info"
                  />
                  <HorizontalBar
                    label="RENT subscriptions"
                    value={portfolioMix?.rent ?? 0}
                    total={portfolioTotal}
                    meta={`${portfolioMix?.rent ?? 0} total`}
                    tone="default"
                  />
                  <HorizontalBar
                    label="LEASE subscriptions"
                    value={portfolioMix?.lease ?? 0}
                    total={portfolioTotal}
                    meta={`${portfolioMix?.lease ?? 0} total`}
                    tone="success"
                  />

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Direct sales (window)
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-950">
                      {String(branchOverview?.direct_sales.count ?? 0)}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Gross value {money(branchOverview?.direct_sales.gross_total)} · Delivery and invoicing tracked in Billing/Delivery modules.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton href={ROUTES.admin.billingDirectSales} variant="secondary" className="h-9 px-3 text-xs">
                        Direct sales
                      </ActionButton>
                      <ActionButton href={ROUTES.admin.deliveries} variant="secondary" className="h-9 px-3 text-xs">
                        Deliveries
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </CockpitPanel>

              <CockpitPanel
                title="Inventory and raw materials"
                description="Stock and reorder posture comes from product-backed inventory summary."
                actionHref={ROUTES.admin.inventoryStockOnHand}
                actionLabel="Open stock"
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Stock Rows"
                    value={String(stockSummary?.count ?? 0)}
                    subtext={`${branchOverview?.stock.location_count ?? 0} stock locations in scope`}
                    tone="default"
                    className="rounded-2xl p-4"
                  />
                  <StatCard
                    label="Below Reorder"
                    value={String(lowStockRows.length)}
                    subtext="Inventory items below reorder level"
                    tone={lowStockRows.length > 0 ? "warning" : "success"}
                    className="rounded-2xl p-4"
                  />
                  <StatCard
                    label="Raw Alerts"
                    value={String(rawMaterialLowRows.length)}
                    subtext="Raw-material-compatible items"
                    tone={rawMaterialLowRows.length > 0 ? "warning" : "success"}
                    className="rounded-2xl p-4"
                  />
                </div>
                {lowStockRows.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    {lowStockRows.slice(0, 4).map((row: StockSummaryRow) => (
                      <div
                        key={row.item_id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium text-amber-950">
                          {row.product_code} · {row.product_name}
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-amber-700">
                          {formatQuantity(row.on_hand_qty)} / {formatQuantity(row.reorder_level_qty)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                    No reorder alerts returned by the current stock summary.
                  </div>
                )}
              </CockpitPanel>

              <CockpitPanel
                title="Back-office finance posture"
                description="Procurement, salary, and reimbursement signals remain source-linked to accounting workflows."
                actionHref={ROUTES.admin.accounting}
                actionLabel="Open accounting"
              >
                <div className="grid gap-3">
                  <StatCard
                    label="Purchase Drafts"
                    value={String(purchaseDrafts?.count ?? 0)}
                    subtext={`${purchaseApproved?.count ?? 0} approved purchase bill(s) awaiting next step`}
                    tone={(purchaseActionCount ?? 0) > 0 ? "warning" : "success"}
                    icon={<ShoppingCart className="h-5 w-5" />}
                    className="rounded-2xl p-4"
                  />
                  <StatCard
                    label="Salary Payables"
                    value={String(salaryPayables?.count ?? 0)}
                    subtext={`${money(branchOverview?.people_costs.salary_paid_total)} salary paid in scope`}
                    tone={(salaryPayables?.count ?? 0) > 0 ? "warning" : "success"}
                    icon={<CreditCard className="h-5 w-5" />}
                    className="rounded-2xl p-4"
                  />
                  <StatCard
                    label="Reimbursements"
                    value={String(expenseClaimQueue?.count ?? 0)}
                    subtext={`${money(branchOverview?.people_costs.reimbursement_total)} reimbursed in scope`}
                    tone={(expenseClaimQueue?.count ?? 0) > 0 ? "warning" : "success"}
                    icon={<Wallet className="h-5 w-5" />}
                    className="rounded-2xl p-4"
                  />
                </div>
              </CockpitPanel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <CockpitPanel
                title="Recent collections trend"
                description="Compact trend built from the real recent-payment surface in this dashboard window."
                actionHref={ROUTES.admin.payments}
                actionLabel="Open payments"
              >
                {collectionTrendRows.length > 0 ? (
                  <div className="flex min-h-48 items-end gap-3">
                    {collectionTrendRows.map(([label, amount]) => (
                      <div key={label} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t-xl bg-gradient-to-t from-emerald-600 to-emerald-300"
                          style={{
                            height: `${Math.max(12, asPercent(amount, collectionTrendMax) * 1.55)}px`,
                          }}
                          title={`${label}: ${money(amount)}`}
                        />
                        <div className="text-center text-[11px] font-medium text-slate-500">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No recent payment trend"
                    description="The selected dashboard window has no recent payment rows to chart."
                  />
                )}
              </CockpitPanel>

              <CockpitPanel
                title="Quick Operational Actions"
                description="Open canonical workflows directly from the cockpit without duplicating operational posting logic."
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    {
                      label: "Create subscription",
                      href: ROUTES.admin.subscriptionsAdvanceEmiCreate,
                      icon: <Users className="h-4 w-4" />,
                    },
                    {
                      label: "Collect EMI",
                      href: ROUTES.admin.financeCollect,
                      icon: <CreditCard className="h-4 w-4" />,
                    },
                    {
                      label: "Create direct sale",
                      href: ROUTES.admin.billingDirectSales,
                      icon: <ShoppingCart className="h-4 w-4" />,
                    },
                    {
                      label: "Invoice & receipt desk",
                      href: ROUTES.admin.billingRegister,
                      icon: <CheckCircle2 className="h-4 w-4" />,
                    },
                    {
                      label: "Create purchase bill",
                      href: ROUTES.admin.accountingPurchaseBills,
                      icon: <Factory className="h-4 w-4" />,
                    },
                    {
                      label: "Stock adjustment",
                      href: ROUTES.admin.inventoryAdjustments,
                      icon: <PackageSearch className="h-4 w-4" />,
                    },
                    {
                      label: "Branch dashboard",
                      href: ROUTES.admin.branchReporting,
                      icon: <BarChart3 className="h-4 w-4" />,
                    },
                    {
                      label: "Delivery queue",
                      href: deliveryQueueHref,
                      icon: <Truck className="h-4 w-4" />,
                    },
                  ].map((action) => (
                    <Link
                      key={action.href}
                      href={action.href}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-[var(--surface-muted)] text-muted-foreground">
                        {action.icon}
                      </span>
                      {action.label}
                    </Link>
                  ))}
                </div>
              </CockpitPanel>
            </div>

            <CockpitPanel
              title="CRM & lead pipeline"
              description="Pipeline posture is shown from the real lead register. Follow-ups and conversions should be executed in the Leads/CRM modules to keep audit trails intact."
              actionHref={ROUTES.admin.crm}
              actionLabel="Open CRM"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Pipeline snapshot
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-950">
                    {String(leadActionCount)}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    Open leads (New + In Progress + Contacted) needing follow-up in the queue.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-5">
                    {[
                      ["New", leadPipelineCounts.new, buildAdminLeadsRoute({ status: "NEW" })],
                      [
                        "In Progress",
                        leadPipelineCounts.in_progress,
                        buildAdminLeadsRoute({ status: "IN_PROGRESS" }),
                      ],
                      [
                        "Contacted",
                        leadPipelineCounts.contacted,
                        buildAdminLeadsRoute({ status: "CONTACTED" }),
                      ],
                      [
                        "Converted",
                        leadPipelineCounts.converted,
                        buildAdminLeadsRoute({ status: "CONVERTED" }),
                      ],
                      ["Closed", leadPipelineCounts.closed, buildAdminLeadsRoute({ status: "CLOSED" })],
                    ].map(([label, value, href]) => (
                      <Link
                        key={String(label)}
                        href={String(href)}
                        className="rounded-2xl border border-white/75 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-white"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {label as ReactNode}
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">
                          {String(value)}
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-slate-500">
                          Open list
                        </div>
                      </Link>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton href={ROUTES.admin.crmLeads} variant="secondary" className="h-9 px-3 text-xs">
                      Lead register
                    </ActionButton>
                    <ActionButton href={newLeadQueueHref} variant="secondary" className="h-9 px-3 text-xs">
                      New leads
                    </ActionButton>
                    <ActionButton href={ROUTES.admin.crmParties} variant="secondary" className="h-9 px-3 text-xs">
                      Party directory
                    </ActionButton>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Latest leads
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Recent inquiries requiring assignment, follow-up, or conversion.
                      </div>
                    </div>
                    <ActionButton href={ROUTES.admin.leads} variant="outline" className="h-9 px-3 text-xs">
                      Open triage
                    </ActionButton>
                  </div>

                  {recentLeads.length === 0 ? (
                    <EmptyState
                      title="No leads in queue"
                      description="Public leads and admin-created leads will appear here once recorded."
                    />
                  ) : (
                    <div className="space-y-2">
                      {recentLeads.slice(0, 6).map((lead) => (
                        <Link
                          key={lead.id}
                          href={`${ROUTES.admin.leads}/${lead.id}`}
                          className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {lead.name || "Unnamed lead"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {lead.phone || "No phone"} · {lead.city || "No city"}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {lead.product_name || lead.interested_product || "General inquiry"} · {lead.status}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-muted-foreground">
                            {formatDateTime(lead.created_at)}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CockpitPanel>

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
                detail={`${requestQueue?.count ?? 0} submitted subscription request(s) and ${leadActionCount} open lead(s) still need operator handoff into real customer or contract records.`}
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
                        className="grid gap-3 rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
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
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3.5 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
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
                        className="grid gap-3 rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
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
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-[var(--surface-card-elevated)] px-3.5 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
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
                        className="rounded-[1.4rem] border border-border bg-[var(--surface-card-elevated)] p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)]"
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
                  className="rounded-[1.45rem] border border-border bg-[var(--surface-card-elevated)] px-5 py-5 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.42)]"
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
                    <span className="inline-flex rounded-full border border-border bg-[var(--surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Canonical
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[1.1rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Operational focus
                      </div>
                      <div className="mt-2 text-sm leading-6 text-slate-700">
                        {item.operationalFocus}
                      </div>
                    </div>
                    <div className="rounded-[1.1rem] border border-border bg-[var(--surface-card-elevated)] px-4 py-3">
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
