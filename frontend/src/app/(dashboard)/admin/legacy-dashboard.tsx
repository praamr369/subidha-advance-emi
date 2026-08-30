// @ts-nocheck
"use client";
import { OperationalCalendar } from "@/components/dashboard/calendar/OperationalCalendar";

import { Printer, Maximize2 } from "lucide-react";
import ModalShell from "@/components/ui/ModalShell";

import Link from "next/link";
import QRCode from "react-qr-code";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
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
import ERPPageShell from "@/components/erp/ERPPageShell";
import { WorkspaceSection } from "@/components/ui/workspace";

import {
  buildSettlementPosture,
  buildWinnerPosture,
  formatDate,
  money,
} from "@/lib/dashboard-summary";
import {
  buildAdminDeliveriesRoute,
  buildAdminLeadsRoute,
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRequestsRoute,
  buildAdminSubscriptionRoute,
  buildAdminCustomerRoute,
} from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import {
  getBranchReportingOverview,
  type BranchReportingOverview,
} from "@/services/branch-control";
import { getAdminDashboard } from "@/services/admin";
import {
  listExpenseClaimsSafe,
  listPurchaseBills,
  listSalarySheetsSafe,
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
  return "border-border bg-muted/50 text-foreground";
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
        <div className="rounded-xl border border-border bg-card p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]">
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

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-700/60 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function KpiPill({ value, label, tone = "neutral" }: { value: string | number; label: string; tone?: "neutral" | "warning" | "success" | "danger" }) {
  const bg = tone === "warning" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    : tone === "danger" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    : tone === "success" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <div className={`flex flex-col items-center rounded-xl px-3 py-2 ${bg}`}>
      <span className="text-base font-bold leading-none">{value}</span>
      <span className="mt-1 text-[10px] font-medium leading-none opacity-80">{label}</span>
    </div>
  );
}

function ModuleOperationalCard({
  title,
  href,
  icon,
  iconBg,
  kpis,
  bar,
  actions,
  alert = false,
}: {
  title: string;
  href: string;
  icon: ReactNode;
  iconBg: string;
  kpis: Array<{ value: string | number; label: string; tone?: "neutral" | "warning" | "success" | "danger" }>;
  bar?: { value: number; max: number; color: string; label: string };
  actions?: Array<{ label: string; href: string }>;
  alert?: boolean;
}) {
  return (
    <div
      className={`group flex flex-col rounded-[1.4rem] border p-4 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-16px_rgba(15,23,42,0.18)] ${
        alert
          ? "border-amber-300/70 bg-gradient-to-br from-amber-50/80 to-amber-100/40 dark:from-amber-950/20 dark:to-amber-900/10 dark:border-amber-700/40"
          : "border-border bg-card"
      }`}
    >
      <Link href={href} className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`rounded-xl p-2 ${iconBg}`}>
            {icon}
          </div>
          <div className="text-sm font-semibold text-foreground">{title}</div>
        </div>
        <ArrowRight className="h-4 w-4 opacity-30 transition group-hover:translate-x-0.5 group-hover:opacity-70" />
      </Link>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {kpis.map((k) => (
          <KpiPill key={k.label} value={k.value} label={k.label} tone={k.tone} />
        ))}
      </div>

      {bar ? (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span>{bar.label}</span>
            <span className="font-semibold">{bar.max > 0 ? Math.round((bar.value / bar.max) * 100) : 0}%</span>
          </div>
          <MiniBar value={bar.value} max={bar.max} color={bar.color} />
        </div>
      ) : null}

      {actions && actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {actions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-flex items-center rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm transition hover:bg-muted/60"
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
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
      ? "bg-muted-foreground"
      : "bg-primary";

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-xs font-semibold text-muted-foreground">{meta}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted/50" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-label={label}>
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
      <div className="flex h-3 overflow-hidden rounded-full bg-muted/50" role="img" aria-label={`Payment mode split: Cash ${money(cash)}, Bank ${money(bank)}, UPI ${money(upi)}`}>
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
      className="grid gap-3 rounded-xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-ring hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_auto]"
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

function StorefrontQRWidget() {
  const [open, setOpen] = useState(false);
  const qrValue = typeof window !== "undefined" ? window.location.origin : "https://example.com";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Expand storefront QR code"
        className="group flex shrink-0 items-center justify-center gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm transition hover:border-ring hover:shadow-md sm:min-w-[200px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative rounded-xl bg-white p-2 shadow-sm transition-transform group-hover:scale-105">
          <QRCode value={qrValue} size={64} />
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/5 opacity-0 transition-opacity group-hover:opacity-100">
            <Maximize2 className="h-5 w-5 text-black/70 drop-shadow-sm" />
          </div>
        </div>
        <div className="text-sm">
          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Storefront QR</p>
          <p className="text-xs text-muted-foreground">Click to expand & print</p>
        </div>
      </button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        title="Storefront QR"
        panelClassName="max-w-sm"
      >
        <div className="p-6 text-center">
          <div className="storefront-qr-print-target mx-auto inline-block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <QRCode value={qrValue} size={200} />
          </div>
          <h2 className="mt-6 text-lg font-bold text-foreground">Scan to visit</h2>
          <p className="mt-1 text-sm text-muted-foreground">{qrValue}</p>
          
          <div className="mt-8 flex items-center justify-center gap-3">
            <ActionButton variant="secondary" onClick={() => setOpen(false)}>
              Close
            </ActionButton>
            <ActionButton
              variant="primary"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={() => {
                const svgEl = document.querySelector('.storefront-qr-print-target svg');
                if (!svgEl) return;
                const win = window.open("", "_blank", "width=450,height=550");
                if (!win) return;
                win.document.write(`<!DOCTYPE html><html><head><title>Storefront QR</title><style>
                  @page { size: auto; margin: 15mm; }
                  * { margin: 0; padding: 0; box-sizing: border-box; }
                  body { font-family: Arial, sans-serif; background: #fff; color: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; text-align: center; }
                  .qr-wrap { background: #fff; padding: 24px; border-radius: 16px; }
                  h2 { margin-top: 20px; font-size: 18px; }
                  p { margin-top: 6px; font-size: 13px; color: #555; }
                </style></head><body>
                  <div class="qr-wrap">${svgEl.outerHTML}</div>
                  <h2>Scan to visit</h2>
                  <p>${qrValue}</p>
                  <script>window.onload=function(){window.print();window.close();}<\/script>
                </body></html>`);
                win.document.close();
              }}
            >
              Print QR Code
            </ActionButton>
          </div>
        </div>
      </ModalShell>
    </>
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
  const coreRequestIdRef = useRef(0);
  const secondaryRequestIdRef = useRef(0);
  const secondaryReadyRef = useRef(false);
  const loadSecondaryDashboardRef = useRef<() => void>(() => undefined);
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

  const loadCoreDashboard = useCallback(async (
    mode: "initial" | "refresh" = "initial"
  ): Promise<boolean> => {
    const requestId = ++coreRequestIdRef.current;
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const legacyPayload = await getAdminDashboard();
      if (requestId !== coreRequestIdRef.current) return false;
      setLegacy(legacyPayload);
      setError(null);
      return true;
    } catch (err) {
      if (requestId !== coreRequestIdRef.current) return false;
      setError(toErrorMessage(err));
      if (mode === "initial") {
        setLegacy(null);
      }
      return false;
    } finally {
      if (requestId === coreRequestIdRef.current) {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    }
  }, []);

  const loadSecondaryDashboard = useCallback(() => {
    const requestId = ++secondaryRequestIdRef.current;
    const isCurrentRequest = () => requestId === secondaryRequestIdRef.current;

    function loadSecondary<T>(
      request: Promise<T>,
      apply: (value: T) => void,
      clear: () => void
    ) {
      void request
        .then((value) => {
          if (isCurrentRequest()) apply(value);
        })
        .catch(() => {
          if (isCurrentRequest()) clear();
        });
    }

    loadSecondary(getDashboardSummaryV2(dashboardQuery), setCanonical, () =>
      setCanonical(null)
    );
    loadSecondary(
      listDashboardOverdue({ ...dashboardQuery, limit: 6 }),
      setOverdue,
      () => setOverdue(null)
    );
    loadSecondary(
      listDashboardUpcoming({ ...dashboardQuery, limit: 6 }),
      setUpcoming,
      () => setUpcoming(null)
    );
    loadSecondary(
      listDashboardRecentPayments({ ...dashboardQuery, limit: 8 }),
      setRecentPayments,
      () => setRecentPayments(null)
    );
    loadSecondary(
      listDashboardReconciliationExceptions({ ...dashboardQuery, limit: 4 }),
      setReconciliationItems,
      () => setReconciliationItems(null)
    );
    loadSecondary(
      listDashboardWinners({ ...dashboardQuery, limit: 4 }),
      setWinnerItems,
      () => setWinnerItems(null)
    );
    loadSecondary(getAdminDeliverySummary(), setDeliverySummary, () =>
      setDeliverySummary(null)
    );
    loadSecondary(
      listAdminSupportRequests({ status: "SUBMITTED" }),
      setSupportQueue,
      () => setSupportQueue(null)
    );
    loadSecondary(listAdminLeads({}), setLeadQueue, () => setLeadQueue(null));
    loadSecondary(
      listSubscriptionRequests("admin", {
        status: "SUBMITTED",
        page: 1,
        pageSize: 1,
      }),
      setRequestQueue,
      () => setRequestQueue(null)
    );
    loadSecondary(
      getBranchReportingOverview(todayBranchReportingQuery),
      setTodayBranchOverview,
      () => setTodayBranchOverview(null)
    );
    loadSecondary(
      getStockSummary({ branch: selectedBranchId || undefined }),
      setStockSummary,
      () => setStockSummary(null)
    );
    loadSecondary(
      listPurchaseBills({ ...branchScopedQuery, status: "DRAFT" }),
      setPurchaseDrafts,
      () => setPurchaseDrafts(null)
    );
    loadSecondary(
      listPurchaseBills({ ...branchScopedQuery, status: "APPROVED" }),
      setPurchaseApproved,
      () => setPurchaseApproved(null)
    );
    loadSecondary(
      listSalarySheetsSafe({ ...branchScopedQuery, status: "POSTED" }),
      setSalaryPayables,
      () => setSalaryPayables(null)
    );
    loadSecondary(
      listExpenseClaimsSafe({ ...branchScopedQuery, status: "POSTED" }),
      setExpenseClaimQueue,
      () => setExpenseClaimQueue(null)
    );
    loadSecondary(getServiceDeskOverview(), setServiceDeskOverview, () =>
      setServiceDeskOverview(null)
    );
    loadSecondary(
      listServiceDeskCases({ ...branchScopedQuery, status: "OPEN" }),
      setOpenServiceCases,
      () => setOpenServiceCases(null)
    );
    loadSecondary(
      listReminders({ status: "PENDING", page_size: 1 }),
      setPendingReminderQueue,
      () => setPendingReminderQueue(null)
    );
    loadSecondary(
      listReminders({ status: "FAILED", page_size: 1 }),
      setFailedReminderQueue,
      () => setFailedReminderQueue(null)
    );

    void getBranchReportingOverview(branchReportingQuery)
      .then(async (branchPayload) => {
        if (!isCurrentRequest()) return;
        setBranchOverview(branchPayload);

        if (selectedBranchId) {
          setBranchBreakdowns([branchPayload]);
          return;
        }

        const results = await Promise.allSettled(
          branchPayload.branches
            .filter((branch) => branch.status === "ACTIVE")
            .slice(0, 6)
            .map((branch) =>
              getBranchReportingOverview({
                ...branchReportingQuery,
                branch_id: branch.id,
              })
            )
        );
        if (!isCurrentRequest()) return;
        setBranchBreakdowns(
          results.flatMap((result) =>
            result.status === "fulfilled" ? [result.value] : []
          )
        );
      })
      .catch(() => {
        if (!isCurrentRequest()) return;
        setBranchOverview(null);
        setBranchBreakdowns([]);
      });
  }, [
    branchReportingQuery,
    branchScopedQuery,
    dashboardQuery,
    selectedBranchId,
    todayBranchReportingQuery,
  ]);

  loadSecondaryDashboardRef.current = loadSecondaryDashboard;

  useEffect(() => {
    let active = true;
    void loadCoreDashboard("initial").then((loaded) => {
      if (!active || !loaded) return;
      secondaryReadyRef.current = true;
      loadSecondaryDashboardRef.current();
    });

    return () => {
      active = false;
    };
  }, [loadCoreDashboard]);

  useEffect(() => {
    if (!secondaryReadyRef.current) return;
    loadSecondaryDashboard();
  }, [loadSecondaryDashboard]);

  const refreshDashboard = useCallback(() => {
    void loadCoreDashboard("refresh");
    loadSecondaryDashboard();
  }, [loadCoreDashboard, loadSecondaryDashboard]);

  const retryDashboard = useCallback(async () => {
    const loaded = await loadCoreDashboard("initial");
    if (!loaded) return;
    secondaryReadyRef.current = true;
    loadSecondaryDashboard();
  }, [loadCoreDashboard, loadSecondaryDashboard]);

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
  const overdueFollowUpHref = ROUTES.admin.emisOverdue;
  const flaggedPaymentQueueHref = buildAdminReconciliationRoute({
    view: "payments",
    flagged: true,
  });
  const deliveryQueueHref = buildAdminDeliveriesRoute({ bucket: "PENDING" });
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

  const getDueRowHref = (row: any) => {
    if (row.source_type === "LEGACY_OUTSTANDING" && row.customer_id) {
      return buildAdminCustomerRoute(row.customer_id);
    }
    if (row.source_type === "DIRECT_SALE") {
      return ROUTES.admin.billingDirectSales;
    }
    return buildAdminSubscriptionRoute(row.subscription_id ?? row.id);
  };

  return (
    <ERPPageShell
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
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex-1 surface-panel-elevated flex flex-wrap items-end justify-between gap-3 rounded-[1.5rem] border border-border bg-card p-4 shadow-sm">
          <label htmlFor="dashboard-branch-scope" className="min-w-[240px] flex-1 text-sm text-muted-foreground md:max-w-sm">
            <span className="enterprise-eyebrow mb-2 block">
              Branch scope
            </span>
            <select
              id="dashboard-branch-scope"
              value={selectedBranchId}
              onChange={(event) => setSelectedBranchId(event.target.value)}
              disabled={loading || refreshing}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground  outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60"
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
            onClick={refreshDashboard}
            disabled={refreshing || loading}
            leftIcon={<RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </ActionButton>
          </div>
          
          <StorefrontQRWidget />
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

        <div aria-live="polite">
        {loading ? <LoadingBlock label="Loading admin dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load admin dashboard"
            description={error}
            onRetry={() => void retryDashboard()}
          />
        ) : null}
        </div>

        {!loading && !error && legacy && summary ? (
          <>
            {legacy.modules ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DashboardKpiCard
                  label="Cash in hand"
                  value={money(legacy.modules.treasury.cash_in_hand)}
                  detail="Live balance of the cash ledger from posted journals."
                  href={ROUTES.admin.finance}
                  tone="success"
                  icon={<Wallet className="h-5 w-5 text-emerald-700" />}
                />
                <DashboardKpiCard
                  label="Bank / UPI balance"
                  value={money(legacy.modules.treasury.bank_balance)}
                  detail="Live balance of the bank ledger from posted journals."
                  href={ROUTES.admin.finance}
                  tone="info"
                  icon={<CreditCard className="h-5 w-5 text-sky-700" />}
                />
                <DashboardKpiCard
                  label="Sales this month"
                  value={money(legacy.modules.sales.month_amount)}
                  detail={`${legacy.modules.sales.month_count} sale(s) this month · ${legacy.modules.sales.today_count} today (${money(legacy.modules.sales.today_amount)})`}
                  href={ROUTES.admin.billingDirectSales}
                  tone="info"
                  icon={<ShoppingCart className="h-5 w-5 text-indigo-700" />}
                />
                <DashboardKpiCard
                  label="Sale dues outstanding"
                  value={money(legacy.modules.sales.outstanding_amount)}
                  detail={`${legacy.modules.sales.outstanding_count} direct sale(s) carry an unpaid balance.`}
                  href={ROUTES.admin.billingDirectSales}
                  tone={legacy.modules.sales.outstanding_count > 0 ? "warning" : "success"}
                  icon={<CircleDollarSign className="h-5 w-5 text-amber-700" />}
                />
              </div>
            ) : null}

            {legacy.modules ? (
              <WorkspaceSection
                title="Operations Command Center"
                description="Live operational KPIs from every module. Take action directly or drill into any workspace."
              >
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <ModuleOperationalCard
                    title="Lucky Plan / EMI"
                    href={ROUTES.admin.subscriptions}
                    icon={<BadgeCheck className="h-4 w-4 text-white" />}
                    iconBg="bg-sky-600 dark:bg-sky-700"
                    alert={legacy.emi.overdue > 0}
                    kpis={[
                      { value: legacy.subscriptions.active, label: "Active", tone: "success" },
                      { value: legacy.emi.pending, label: "Pending", tone: legacy.emi.pending > 0 ? "warning" : "neutral" },
                      { value: legacy.emi.overdue, label: "Overdue", tone: legacy.emi.overdue > 0 ? "danger" : "success" },
                    ]}
                    bar={legacy.subscriptions.active > 0 ? {
                      value: legacy.subscriptions.active - legacy.emi.overdue,
                      max: legacy.subscriptions.active,
                      color: "bg-sky-500",
                      label: "Collection health",
                    } : undefined}
                    actions={[
                      { label: "Collect EMI", href: ROUTES.admin.payments },
                      { label: "View overdue", href: ROUTES.admin.subscriptions },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="Rent & Lease"
                    href={ROUTES.admin.rentLease}
                    icon={<Building2 className="h-4 w-4 text-white" />}
                    iconBg="bg-violet-600 dark:bg-violet-700"
                    alert={legacy.modules.rent_lease.open_demand_count > 0}
                    kpis={[
                      { value: legacy.modules.rent_lease.active_rent, label: "Rent", tone: "neutral" },
                      { value: legacy.modules.rent_lease.active_lease, label: "Lease", tone: "neutral" },
                      { value: legacy.modules.rent_lease.open_demand_count, label: "Open", tone: legacy.modules.rent_lease.open_demand_count > 0 ? "warning" : "success" },
                    ]}
                    bar={(() => {
                      const total = legacy.modules.rent_lease.active_rent + legacy.modules.rent_lease.active_lease;
                      return total > 0 ? {
                        value: total - legacy.modules.rent_lease.open_demand_count,
                        max: total,
                        color: "bg-violet-500",
                        label: "Demand cleared",
                      } : undefined;
                    })()}
                    actions={[
                      { label: "Deposits", href: ROUTES.admin.rentLease },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="Inventory & Purchasing"
                    href={ROUTES.admin.inventory}
                    icon={<PackageSearch className="h-4 w-4 text-white" />}
                    iconBg="bg-slate-600 dark:bg-slate-700"
                    alert={
                      legacy.modules.purchasing.draft_goods_receipts +
                        legacy.modules.purchasing.draft_vendor_bills >
                      0
                    }
                    kpis={[
                      { value: legacy.modules.purchasing.open_purchase_orders, label: "POs open", tone: "neutral" },
                      { value: legacy.modules.purchasing.draft_goods_receipts, label: "GRN draft", tone: legacy.modules.purchasing.draft_goods_receipts > 0 ? "warning" : "neutral" },
                      { value: legacy.modules.purchasing.draft_vendor_bills, label: "Bills draft", tone: legacy.modules.purchasing.draft_vendor_bills > 0 ? "warning" : "neutral" },
                    ]}
                    actions={[
                      { label: "New PO", href: ROUTES.admin.purchaseOrders },
                      { label: "Stock on hand", href: ROUTES.admin.inventoryStockOnHand },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="HR & Payroll"
                    href={ROUTES.admin.hrStaff}
                    icon={<Users className="h-4 w-4 text-white" />}
                    iconBg="bg-emerald-600 dark:bg-emerald-700"
                    alert={
                      legacy.modules.hr.pending_leave_requests + legacy.modules.hr.unpaid_salary_sheets > 0
                    }
                    kpis={[
                      { value: legacy.modules.hr.active_staff, label: "Staff", tone: "neutral" },
                      { value: legacy.modules.hr.pending_leave_requests, label: "Leave req", tone: legacy.modules.hr.pending_leave_requests > 0 ? "warning" : "success" },
                      { value: legacy.modules.hr.unpaid_salary_sheets, label: "Unpaid sal", tone: legacy.modules.hr.unpaid_salary_sheets > 0 ? "danger" : "success" },
                    ]}
                    actions={[
                      { label: "Run payroll", href: ROUTES.admin.hrPayroll },
                      { label: "Leave requests", href: ROUTES.admin.hrLeave },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="CRM Pipeline"
                    href={ROUTES.admin.crm}
                    icon={<BarChart3 className="h-4 w-4 text-white" />}
                    iconBg="bg-indigo-600 dark:bg-indigo-700"
                    alert={legacy.modules.crm_modules.follow_ups_due > 0}
                    kpis={[
                      { value: legacy.modules.crm_modules.open_leads, label: "Leads", tone: "neutral" },
                      { value: legacy.modules.crm_modules.open_opportunities, label: "Opptys", tone: "neutral" },
                      { value: legacy.modules.crm_modules.follow_ups_due, label: "Follow-ups", tone: legacy.modules.crm_modules.follow_ups_due > 0 ? "danger" : "success" },
                    ]}
                    bar={(() => {
                      const total = legacy.modules.crm_modules.open_leads + legacy.modules.crm_modules.open_opportunities;
                      return total > 0 ? {
                        value: legacy.modules.crm_modules.open_opportunities,
                        max: total,
                        color: "bg-indigo-500",
                        label: "Lead → Opportunity",
                      } : undefined;
                    })()}
                    actions={[
                      { label: "New lead", href: buildAdminLeadsRoute() },
                      { label: "Follow-ups", href: ROUTES.admin.crm },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="Support & Service"
                    href={ROUTES.admin.serviceDeskTickets}
                    icon={<ShieldAlert className="h-4 w-4 text-white" />}
                    iconBg="bg-rose-600 dark:bg-rose-700"
                    alert={legacy.modules.support.open_tickets > 0}
                    kpis={[
                      { value: legacy.modules.support.open_tickets, label: "Tickets", tone: legacy.modules.support.open_tickets > 0 ? "danger" : "success" },
                      { value: legacy.modules.support.open_delivery_cases, label: "Delivery", tone: legacy.modules.support.open_delivery_cases > 0 ? "warning" : "neutral" },
                      { value: 0, label: "Resolved", tone: "success" },
                    ]}
                    actions={[
                      { label: "New ticket", href: ROUTES.admin.serviceDeskTickets },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="Batches & Draws"
                    href={ROUTES.admin.batches}
                    icon={<CalendarClock className="h-4 w-4 text-white" />}
                    iconBg="bg-amber-600 dark:bg-amber-700"
                    kpis={[
                      { value: legacy.batches.live_batches ?? legacy.batches.total_batches, label: "Live", tone: "neutral" },
                      { value: legacy.batches.total_draws, label: "Draws", tone: "success" },
                      {
                        value: legacy.batches.next_draw_batch?.days_until_draw != null
                          ? `${legacy.batches.next_draw_batch.days_until_draw}d`
                          : "—",
                        label: "Next draw",
                        tone: legacy.batches.next_draw_batch?.days_until_draw != null && legacy.batches.next_draw_batch.days_until_draw <= 3 ? "warning" : "neutral",
                      },
                    ]}
                    actions={[
                      { label: "Run draw", href: ROUTES.admin.batches },
                    ]}
                  />
                  <ModuleOperationalCard
                    title="Commissions"
                    href={ROUTES.admin.financeCommissions}
                    icon={<Percent className="h-4 w-4 text-white" />}
                    iconBg="bg-teal-600 dark:bg-teal-700"
                    alert={(legacy.commission_summary?.pending_count ?? 0) > 0}
                    kpis={[
                      {
                        value: money(legacy.commission_summary?.pending_commission ?? "0.00"),
                        label: "Pending",
                        tone: (legacy.commission_summary?.pending_count ?? 0) > 0 ? "warning" : "success",
                      },
                      { value: money(legacy.commission_summary?.settled_commission ?? "0.00"), label: "Settled", tone: "success" },
                      { value: legacy.commission_summary?.total_count ?? 0, label: "Entries", tone: "neutral" },
                    ]}
                    actions={[
                      { label: "Process payout", href: ROUTES.admin.financeCommissions },
                    ]}
                  />
                </div>
              </WorkspaceSection>
            ) : null}

            {/* Attendance Block */}
            {legacy.attendance ? (
              <WorkspaceSection
                title="Today's Attendance"
                description="Staff presence snapshot for today."
              >
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-border bg-card p-4 text-center">
                    <div className="text-2xl font-bold text-foreground">{legacy.attendance.total_staff}</div>
                    <div className="mt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Staff</div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/20 dark:border-emerald-800/40 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{legacy.attendance.present}</div>
                    <div className="mt-1 text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wide">Present</div>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-900/20 dark:border-amber-800/40 p-4 text-center">
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{legacy.attendance.half_day}</div>
                    <div className="mt-1 text-[11px] font-medium text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wide">Half Day</div>
                  </div>
                  <div className="rounded-xl border border-red-200 bg-red-50/60 dark:bg-red-900/20 dark:border-red-800/40 p-4 text-center">
                    <div className="text-2xl font-bold text-red-700 dark:text-red-400">{legacy.attendance.absent}</div>
                    <div className="mt-1 text-[11px] font-medium text-red-600/80 dark:text-red-400/80 uppercase tracking-wide">Absent</div>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50/60 dark:bg-sky-900/20 dark:border-sky-800/40 p-4 text-center">
                    <div className="text-2xl font-bold text-sky-700 dark:text-sky-400">{legacy.attendance.on_leave}</div>
                    <div className="mt-1 text-[11px] font-medium text-sky-600/80 dark:text-sky-400/80 uppercase tracking-wide">On Leave</div>
                  </div>
                </div>
                {legacy.attendance.total_staff > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Attendance Rate</span>
                      <span className="font-bold text-foreground">{legacy.attendance.attendance_rate}%</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-700/60 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${legacy.attendance.attendance_rate}%` }}
                      />
                    </div>
                    {legacy.attendance.not_marked > 0 ? (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {legacy.attendance.not_marked} staff not yet marked today
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton href={ROUTES.admin.hrAttendance} variant="secondary" className="h-8 px-3 text-xs">
                        Mark Attendance
                      </ActionButton>
                      <ActionButton href={ROUTES.admin.hrStaff} variant="secondary" className="h-8 px-3 text-xs">
                        View Staff
                      </ActionButton>
                      <ActionButton href={ROUTES.admin.hrPayroll} variant="secondary" className="h-8 px-3 text-xs">
                        Run Payroll
                      </ActionButton>
                    </div>
                  </div>
                ) : null}
              </WorkspaceSection>
            ) : null}

            {/* Quick Actions Grid */}
            <WorkspaceSection
              title="Quick Actions"
              description="Jump to frequently-used operations across all modules."
            >
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                {[
                  { label: "Collect EMI", href: ROUTES.admin.payments, icon: "💰", bg: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40" },
                  { label: "New Subscription", href: ROUTES.admin.subscriptions, icon: "📋", bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40" },
                  { label: "Run Lucky Draw", href: ROUTES.admin.batches, icon: "🎲", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40" },
                  { label: "New Direct Sale", href: ROUTES.admin.billing, icon: "🧾", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40" },
                  { label: "Create Purchase Order", href: ROUTES.admin.purchaseOrders, icon: "📦", bg: "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800/40" },
                  { label: "Schedule Delivery", href: ROUTES.admin.deliveries, icon: "🚚", bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/40" },
                  { label: "New Lead", href: buildAdminLeadsRoute(), icon: "👤", bg: "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/40" },
                  { label: "Process Commission", href: ROUTES.admin.financeCommissions, icon: "📊", bg: "bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/40" },
                  { label: "Accounting", href: ROUTES.admin.accounting, icon: "📒", bg: "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40" },
                  { label: "Service Desk", href: ROUTES.admin.serviceDeskTickets, icon: "🔧", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40" },
                  { label: "Rent & Lease", href: ROUTES.admin.rentLease, icon: "🏠", bg: "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40" },
                  { label: "Manufacturing", href: ROUTES.admin.manufacturing, icon: "🏭", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40" },
                ].map((action) => (
                  <Link
                    key={action.href + action.label}
                    href={action.href}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${action.bg}`}
                  >
                    <span className="text-xl">{action.icon}</span>
                    <span className="text-sm font-semibold text-foreground">{action.label}</span>
                  </Link>
                ))}
              </div>
            </WorkspaceSection>

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
                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
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

                  <div className="rounded-2xl border border-border bg-muted/40 p-4">
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
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="FG Outward"
                    value={formatQuantity(stockSummary?.summary?.total_fg_out_qty)}
                    subtext="Finished goods shipped/sold"
                    tone="info"
                    className="rounded-2xl p-4"
                  />
                  <StatCard
                    label="FG Inward"
                    value={formatQuantity(stockSummary?.summary?.total_fg_in_qty)}
                    subtext="Finished goods received/produced"
                    tone="success"
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
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-ring hover:bg-muted/50"
                    >
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground">
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
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
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
                        className="rounded-xl border border-border bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)] transition hover:-translate-y-0.5 hover:bg-card"
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
                          className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-3 transition hover:-translate-y-0.5 hover:bg-card"
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
                label="Collection progress"
                value={`${asPercent(
                  toNumber(summary.total_paid_amount),
                  toNumber(summary.total_paid_amount) +
                    toNumber(summary.total_pending_amount)
                ).toFixed(1)}%`}
                subtext={`${summary.paid_emis} of ${summary.paid_emis + (summary.pending_emis ?? 0)} EMI rows settled`}
                tone="info"
                icon={<Percent className="h-5 w-5" />}
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
                  <div className="rounded-[1.3rem] border border-border bg-card p-4">
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
                  <div className="rounded-[1.3rem] border border-border bg-card p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Today&apos;s transactions
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-950">
                      {legacy.collections?.today_transaction_count ?? 0} posted
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {legacy.collections?.today_reversed_payments ?? 0} reversed row(s) excluded from net
                    </div>
                  </div>
                  <div className="rounded-[1.3rem] border border-border bg-card p-4">
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
                  <div className="rounded-[1.3rem] border border-border bg-card p-4">
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
                          className="rounded-[1.2rem] border border-border bg-card px-4 py-3 text-sm text-slate-700"
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

              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <WorkspaceSection
                title="Gross throughput and portfolio risk"
                description="Gross (pre-reversal) collection throughput and portfolio default posture. Net collections live in the page header; commission settlement lives in the Commissions module card."
                actionHref={ROUTES.admin.financeCommissions}
                actionLabel="Open commission finance"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard
                    label="Gross Today"
                    value={money(legacy.collections?.today_gross_amount)}
                    subtext={`${legacy.collections?.today_active_payments ?? 0} active payment rows before reversals`}
                    tone="default"
                    icon={<Wallet className="h-5 w-5" />}
                  />
                  <StatCard
                    label="Defaulted"
                    value={String(legacy.risk.defaulted)}
                    subtext={`${legacy.risk.default_rate.toFixed(2)}% default rate across the portfolio`}
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
                      href={ROUTES.admin.subscriptionRequests}
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                    >
                      View product requests
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
                        className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={getDueRowHref(row)}
                              className="text-sm font-semibold text-slate-950 transition hover:text-sky-700"
                            >
                              {row.subscription_number ||
                                `Subscription ${row.subscription_id ?? row.id}`}
                            </Link>
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                                row.is_overdue
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-border bg-muted/50 text-slate-600"
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
                            href={getDueRowHref(row)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-ring hover:bg-muted/50"
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
                        className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
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
                            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-ring hover:bg-muted/50"
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
                description={`${reconciliationSurface?.checked_count ?? 0} subscription(s) checked, ${reconciliationSurface?.flagged_count ?? 0} flagged in the canonical reconciliation lane for the selected drilldown window.`}
                action={
                  <>
                    <ActionButton
                      href={buildAdminReconciliationRoute({ flagged: true })}
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                    >
                      Open flagged rows
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
                {flaggedRows.length > 0 ? (
                  <div className="grid gap-3">
                    {flaggedRows.map((row) => (
                      <div
                        key={row.subscription_id}
                        className="rounded-xl border border-border bg-card p-4 shadow-[0_14px_34px_-30px_rgba(15,23,42,0.35)]"
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

          </>
        ) : null}
        </div>
        <div className="lg:col-span-1 space-y-6">
          <OperationalCalendar />
        </div>
      </div>
    </ERPPageShell>
  );
}