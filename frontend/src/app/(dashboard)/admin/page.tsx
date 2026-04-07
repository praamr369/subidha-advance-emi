// frontend/src/app/(dashboard)/admin/page.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingDown,
  Wallet,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  CreditCard,
  Receipt,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  PlusCircle,
  DollarSign,
  Percent,
  Zap,
  Package,
  ClipboardList,
  PieChart,
  Sparkles,
} from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection as SectionCard } from "@/components/ui/workspace";
import { apiFetch, toArray } from "@/lib/api";
import {
  buildAdminBatchRoute,
  buildAdminPaymentRoute,
  buildAdminReconciliationRoute,
  buildAdminSubscriptionRoute,
} from "@/lib/route-builders";
import type { PaymentRegisterRow, PaymentRegisterSummary } from "@/services/payments";
import type { AdminCommissionSummaryResponse } from "@/types/commission";

// =====================================================
// TYPES
// =====================================================
type SubscriptionKpisResponse = {
  total_subscriptions?: number;
  active_subscriptions?: number;
  won_subscriptions?: number;
  completed_subscriptions?: number;
  defaulted_subscriptions?: number;
  total_contract_value?: string;
  total_monthly_value?: string;
  total_waived_value?: string;
};

type AdminDashboardResponse = {
  financial?: {
    total_revenue?: string | number;
    today_collection?: string | number;
    total_outstanding?: string | number;
  };
  collections?: {
    today_transaction_count?: number;
    today_active_payments?: number;
    today_reversed_payments?: number;
    today_gross_amount?: string | number;
    today_reversed_amount?: string | number;
    today_net_amount?: string | number;
  };
  emi?: {
    pending?: number;
    overdue?: number;
  };
  subscriptions?: {
    active?: number;
    completed?: number;
    won?: number;
  };
  batches?: {
    total_batches?: number;
    total_draws?: number;
    live_batches?: number;
    open_batches?: number;
    next_draw_batch?: NextDrawBatch | null;
  };
  operations?: {
    due_today_emis?: number;
    overdue_emis?: number;
    open_batches?: number;
    next_draw_batch?: NextDrawBatch | null;
  };
  recent_activity?: RecentActivityItem[];
  risk?: {
    healthy?: number;
    at_risk?: number;
    high_risk?: number;
    defaulted?: number;
    default_rate?: number;
  };
  financial_health?: Record<string, unknown>;
};

type NextDrawBatch = {
  id: number;
  batch_code: string;
  status?: string | null;
  draw_day?: number | null;
  draw_date?: string | null;
  days_until_draw?: number | null;
  subscription_count?: number | null;
  total_slots?: number | null;
  available_slots?: number | null;
};

type RecentActivityItem = {
  kind?: string;
  payment_id?: number;
  amount?: string | number;
  payment_date?: string | null;
  created_at?: string | null;
  method?: string | null;
  reference_no?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  subscription_id?: number | null;
  subscription_number?: string | null;
  batch_code?: string | null;
  lucky_number?: number | null;
  is_reversed?: boolean;
};

type ReconciliationAttentionRow = {
  subscription_id: number;
  subscription_number: string;
  customer_name?: string;
  total_amount?: string;
  paid_amount?: string;
  waived_amount?: string;
  pending_outstanding?: string;
  computed_outstanding?: string;
  delta?: string;
};

type ReconciliationAttentionResponse = {
  checked_count?: number;
  flagged_count?: number;
  results?: ReconciliationAttentionRow[];
  note?: string;
};

type EmiRow = {
  id: number;
  subscription: number;
  customer_name?: string;
  customer_phone?: string;
  month_no: number;
  due_date?: string;
  amount: string;
  total_paid?: string;
  balance_amount?: string;
  outstanding_amount?: string;
  status: string;
  batch_code?: string | null;
  lucky_number?: number | null;
};

type DashboardWarning = {
  id: string;
  title: string;
  description: string;
};

type LaneHealth = {
  dashboard: boolean;
  subscriptionKpis: boolean;
  reconciliation: boolean;
  commissions: boolean;
  dueToday: boolean;
  overdue: boolean;
  recentPayments: boolean;
};

const EMPTY_LANE_HEALTH: LaneHealth = {
  dashboard: false,
  subscriptionKpis: false,
  reconciliation: false,
  commissions: false,
  dueToday: false,
  overdue: false,
  recentPayments: false,
};

const EMPTY_PAYMENT_SUMMARY: PaymentRegisterSummary = {
  visible_payments: 0,
  gross_amount: "0.00",
  active_payments: 0,
  active_amount: "0.00",
  reversed_payments: 0,
  reversed_amount: "0.00",
  net_collected_amount: "0.00",
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function money(value: string | number | null | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function metricNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

function moneyValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "—" : money(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function overdueDays(dueDate: string | null | undefined): number {
  if (!dueDate) return 0;
  const parsed = Date.parse(dueDate);
  if (Number.isNaN(parsed)) return 0;
  const diffMs = Date.now() - parsed;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load admin operations dashboard.";
}

function localDateISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeEmi(row: Record<string, unknown>): EmiRow {
  return {
    id: Number(row.id ?? 0),
    subscription: Number(row.subscription ?? 0),
    customer_name:
      typeof row.customer_name === "string" ? row.customer_name : undefined,
    customer_phone:
      typeof row.customer_phone === "string" ? row.customer_phone : undefined,
    month_no: Number(row.month_no ?? 0),
    due_date: typeof row.due_date === "string" ? row.due_date : undefined,
    amount: String(row.amount ?? "0.00"),
    total_paid:
      typeof row.total_paid === "string" ? row.total_paid : undefined,
    balance_amount:
      typeof row.balance_amount === "string" ? row.balance_amount : undefined,
    outstanding_amount:
      typeof row.outstanding_amount === "string"
        ? row.outstanding_amount
        : undefined,
    status: typeof row.status === "string" ? row.status : "PENDING",
    batch_code:
      typeof row.batch_code === "string" || row.batch_code === null
        ? (row.batch_code as string | null)
        : undefined,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
  };
}

function normalizeRecentActivity(row: RecentActivityItem): PaymentRegisterRow {
  return {
    id: Number(row.payment_id ?? 0),
    amount: String(row.amount ?? "0.00"),
    method: row.method ?? undefined,
    reference_no: row.reference_no ?? undefined,
    payment_date: row.payment_date ?? row.created_at ?? undefined,
    customer_name: row.customer_name ?? undefined,
    customer_phone: row.customer_phone ?? undefined,
    subscription:
      typeof row.subscription_id === "number" ? row.subscription_id : undefined,
    subscription_number:
      row.subscription_number ??
      (typeof row.subscription_id === "number"
        ? `SUB-${row.subscription_id}`
        : undefined),
    batch_code: row.batch_code ?? undefined,
    lucky_number:
      typeof row.lucky_number === "number" ? row.lucky_number : undefined,
    emi: undefined,
    collected_by_username: null,
    verified_by_username: null,
    is_reversed: Boolean(row.is_reversed),
  };
}

// =====================================================
// UI COMPONENTS
// =====================================================
function KpiCard({
  title,
  value,
  icon,
  trend,
  trendValue,
  tone = "default",
  progress,
  progressValue,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  tone?: "default" | "success" | "warning" | "danger";
  progress?: number;
  progressValue?: string;
  href?: string;
}) {
  const toneColors = {
    default: "border-border bg-card hover:border-ring",
    success: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300",
    warning: "border-amber-200 bg-amber-50/50 hover:border-amber-300",
    danger: "border-red-200 bg-red-50/50 hover:border-red-300",
  };

  const card = (
    <div className={`rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md ${toneColors[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
        <div className="rounded-xl bg-background/50 p-2 text-muted-foreground">{icon}</div>
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{progressValue || "Progress"}</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
      {trend && trendValue && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {trend === "up" ? (
            <ArrowUpRight className="h-3 w-3 text-emerald-600" />
          ) : trend === "down" ? (
            <ArrowDownRight className="h-3 w-3 text-red-600" />
          ) : null}
          <span
            className={
              trend === "up"
                ? "text-emerald-600"
                : trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
            }
          >
            {trendValue}
          </span>
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

function LaneCard({
  eyebrow,
  title,
  description,
  value,
  secondaryValue,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  tone = "default",
  icon,
  healthStatus,
}: {
  eyebrow: string;
  title: string;
  description: string;
  value: string;
  secondaryValue?: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon: React.ReactNode;
  healthStatus?: "healthy" | "warning" | "critical";
}) {
  const toneClasses = {
    default: "border-border bg-card",
    danger: "border-red-200 bg-red-50/50",
    warning: "border-amber-200 bg-amber-50/50",
    success: "border-emerald-200 bg-emerald-50/50",
  };

  const healthIcon = {
    healthy: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
    warning: <AlertCircle className="h-3.5 w-3.5 text-amber-600" />,
    critical: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  };

  return (
    <div className={`rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </div>
            {healthStatus && healthIcon[healthStatus]}
          </div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="rounded-xl bg-background/50 p-2 text-muted-foreground">{icon}</div>
      </div>

      <div className="mt-4 space-y-1">
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {secondaryValue && <div className="text-sm text-muted-foreground">{secondaryValue}</div>}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={primaryHref}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
        >
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link
            href={secondaryHref}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

function QuickActionButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-3 text-center transition hover:bg-muted hover:shadow-sm"
    >
      <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </Link>
  );
}

function PaymentRow({ payment }: { payment: PaymentRegisterRow }) {
  const isReversed = payment.is_reversed;
  return (
    <div className="rounded-xl border border-border bg-background p-4 transition hover:bg-muted/30 hover:shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-medium text-foreground">
              {payment.customer_name || "Unknown customer"}
            </div>
            <StatusBadge
              status={isReversed ? "REVERSED" : "ACTIVE"}
              label={isReversed ? "Reversed" : "Recorded"}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Payment #{payment.id}</span>
            <span>•</span>
            <span>{payment.subscription_number || `SUB-${payment.subscription}`}</span>
            <span>•</span>
            <span>{payment.method || "—"}</span>
            <span>•</span>
            <span>{formatDate(payment.payment_date)}</span>
          </div>
          {payment.reference_no && (
            <div className="mt-1 text-xs text-muted-foreground">Ref: {payment.reference_no}</div>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">{money(payment.amount)}</div>
            <div className="text-xs text-muted-foreground">{isReversed ? "Reversed" : "Posted"}</div>
          </div>
          <Link
            href={buildAdminPaymentRoute(payment.id)}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}

function ReconciliationRow({ row }: { row: ReconciliationAttentionRow }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4 transition hover:bg-muted/30 hover:shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-foreground">{row.subscription_number}</div>
          <div className="mt-1 text-sm text-muted-foreground">{row.customer_name || "Unknown customer"}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Paid: {money(row.paid_amount)}</span>
            <span>Waived: {money(row.waived_amount)}</span>
            <span>Pending: {money(row.pending_outstanding)}</span>
            <span>Computed: {money(row.computed_outstanding)}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-semibold text-foreground">{money(row.delta)}</div>
            <div className="text-xs text-muted-foreground">Delta</div>
          </div>
          <Link
            href={buildAdminSubscriptionRoute(row.subscription_id)}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function AdminDashboardPage() {
  const [dashboardSnapshot, setDashboardSnapshot] = useState<AdminDashboardResponse | null>(null);
  const [subscriptionKpis, setSubscriptionKpis] = useState<SubscriptionKpisResponse | null>(null);
  const [reconciliationAttention, setReconciliationAttention] = useState<ReconciliationAttentionResponse | null>(null);
  const [commissionSummary, setCommissionSummary] = useState<AdminCommissionSummaryResponse | null>(null);
  const [dueTodayRows, setDueTodayRows] = useState<EmiRow[]>([]);
  const [overdueRows, setOverdueRows] = useState<EmiRow[]>([]);
  const [recentPayments, setRecentPayments] = useState<PaymentRegisterRow[]>([]);
  const [recentPaymentsSummary, setRecentPaymentsSummary] = useState<PaymentRegisterSummary>(EMPTY_PAYMENT_SUMMARY);
  const [laneHealth, setLaneHealth] = useState<LaneHealth>(EMPTY_LANE_HEALTH);
  const [warnings, setWarnings] = useState<DashboardWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadDashboard = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      const today = localDateISO();

      if (mode === "initial") setLoading(true);
      else setRefreshing(true);

      try {
        const [
          dashboardResult,
          subscriptionKpisResult,
          reconciliationAttentionResult,
          commissionSummaryResult,
          dueTodayResult,
          overdueResult,
        ] = await Promise.allSettled([
          apiFetch<AdminDashboardResponse>("/admin/dashboard/"),
          apiFetch<SubscriptionKpisResponse>("/admin/subscriptions/kpis/"),
          apiFetch<ReconciliationAttentionResponse>("/admin/subscriptions/reconciliation-attention/"),
          apiFetch<AdminCommissionSummaryResponse>("/admin/commissions/summary/"),
          apiFetch<unknown>(`/admin/emis/?status=PENDING&date_from=${today}&date_to=${today}`),
          apiFetch<unknown>("/admin/emis/?overdue_only=true"),
        ]);

        const nextLaneHealth: LaneHealth = { ...EMPTY_LANE_HEALTH };
        const nextWarnings: DashboardWarning[] = [];

        let nextDashboardSnapshot: AdminDashboardResponse | null = null;
        let nextSubscriptionKpis: SubscriptionKpisResponse | null = null;
        let nextReconciliationAttention: ReconciliationAttentionResponse | null = null;
        let nextCommissionSummary: AdminCommissionSummaryResponse | null = null;
        let nextDueTodayRows: EmiRow[] = [];
        let nextOverdueRows: EmiRow[] = [];
        let nextRecentPayments: PaymentRegisterRow[] = [];
        let nextRecentPaymentsSummary: PaymentRegisterSummary = EMPTY_PAYMENT_SUMMARY;

        let successfulLanes = 0;

        if (dashboardResult.status === "fulfilled") {
          nextDashboardSnapshot = dashboardResult.value;
          nextLaneHealth.dashboard = true;
          successfulLanes++;

          if (
            dashboardResult.value.collections &&
            Array.isArray(dashboardResult.value.recent_activity)
          ) {
            nextRecentPayments = dashboardResult.value.recent_activity.map(
              normalizeRecentActivity
            );
            nextRecentPaymentsSummary = {
              visible_payments: Number(
                dashboardResult.value.collections.today_transaction_count ?? 0
              ),
              gross_amount: String(
                dashboardResult.value.collections.today_gross_amount ?? "0.00"
              ),
              active_payments: Number(
                dashboardResult.value.collections.today_active_payments ?? 0
              ),
              active_amount: String(
                dashboardResult.value.collections.today_net_amount ?? "0.00"
              ),
              reversed_payments: Number(
                dashboardResult.value.collections.today_reversed_payments ?? 0
              ),
              reversed_amount: String(
                dashboardResult.value.collections.today_reversed_amount ?? "0.00"
              ),
              net_collected_amount: String(
                dashboardResult.value.collections.today_net_amount ?? "0.00"
              ),
            };
            nextLaneHealth.recentPayments = true;
            successfulLanes++;
          } else {
            nextWarnings.push({
              id: "recent-payments",
              title: "Recent payments lane failed",
              description: "Today payment summary was missing from the admin dashboard payload.",
            });
          }
        } else {
          nextWarnings.push({
            id: "dashboard",
            title: "Admin dashboard lane failed",
            description: "Core admin KPI truth from the dashboard endpoint did not load.",
          });
        }

        if (subscriptionKpisResult.status === "fulfilled") {
          nextSubscriptionKpis = subscriptionKpisResult.value;
          nextLaneHealth.subscriptionKpis = true;
          successfulLanes++;
        } else {
          nextWarnings.push({
            id: "subscription-kpis",
            title: "Subscription KPI lane failed",
            description: "Active contract KPI data did not load on this refresh.",
          });
        }

        if (reconciliationAttentionResult.status === "fulfilled") {
          nextReconciliationAttention = reconciliationAttentionResult.value;
          nextLaneHealth.reconciliation = true;
          successfulLanes++;
        } else {
          nextWarnings.push({
            id: "reconciliation-attention",
            title: "Reconciliation attention lane failed",
            description: "Subscription mismatch monitoring did not load.",
          });
        }

        if (commissionSummaryResult.status === "fulfilled") {
          nextCommissionSummary = commissionSummaryResult.value;
          nextLaneHealth.commissions = true;
          successfulLanes++;
        } else {
          nextWarnings.push({
            id: "commission-summary",
            title: "Commission finance lane failed",
            description: "Commission finance summary did not load.",
          });
        }

        if (dueTodayResult.status === "fulfilled") {
          nextDueTodayRows = toArray<Record<string, unknown>>(dueTodayResult.value).map(normalizeEmi);
          nextLaneHealth.dueToday = true;
          successfulLanes++;
        } else {
          nextWarnings.push({
            id: "due-today",
            title: "Due-today EMI lane failed",
            description: "Today’s collection queue did not load.",
          });
        }

        if (overdueResult.status === "fulfilled") {
          nextOverdueRows = toArray<Record<string, unknown>>(overdueResult.value).map(normalizeEmi);
          nextLaneHealth.overdue = true;
          successfulLanes++;
        } else {
          nextWarnings.push({
            id: "overdue",
            title: "Overdue recovery lane failed",
            description: "Overdue EMI recovery data did not load.",
          });
        }

        setDashboardSnapshot(nextDashboardSnapshot);
        setSubscriptionKpis(nextSubscriptionKpis);
        setReconciliationAttention(nextReconciliationAttention);
        setCommissionSummary(nextCommissionSummary);
        setDueTodayRows(nextDueTodayRows);
        setOverdueRows(nextOverdueRows);
        setRecentPayments(nextRecentPayments);
        setRecentPaymentsSummary(nextRecentPaymentsSummary);
        setLaneHealth(nextLaneHealth);
        setWarnings(nextWarnings);
        setLastRefreshed(new Date());

        if (successfulLanes === 0) {
          setError("Unable to load any admin dashboard lanes. Check admin authentication and backend API availability.");
        } else {
          setError(null);
        }
      } catch (err) {
        setError(toErrorMessage(err));
        setDashboardSnapshot(null);
        setSubscriptionKpis(null);
        setReconciliationAttention(null);
        setCommissionSummary(null);
        setDueTodayRows([]);
        setOverdueRows([]);
        setRecentPayments([]);
        setRecentPaymentsSummary(EMPTY_PAYMENT_SUMMARY);
        setLaneHealth(EMPTY_LANE_HEALTH);
        setWarnings([]);
      } finally {
        if (mode === "initial") setLoading(false);
        else setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDashboard("initial");
  }, [loadDashboard]);

  const todayCollectedAmount = useMemo(
    () => Number(recentPaymentsSummary.net_collected_amount || 0),
    [recentPaymentsSummary.net_collected_amount]
  );
  const todayGrossCollectedAmount = useMemo(
    () => Number(recentPaymentsSummary.gross_amount || 0),
    [recentPaymentsSummary.gross_amount]
  );
  const todayReversedAmount = useMemo(
    () => Number(recentPaymentsSummary.reversed_amount || 0),
    [recentPaymentsSummary.reversed_amount]
  );
  const overdueExposure = useMemo(
    () =>
      overdueRows.reduce(
        (sum, row) => sum + Number(row.balance_amount ?? row.outstanding_amount ?? row.amount ?? 0),
        0
      ),
    [overdueRows]
  );
  const oldestOverdue = useMemo(
    () => overdueRows.reduce((max, row) => Math.max(max, overdueDays(row.due_date)), 0),
    [overdueRows]
  );

  const priorityAlerts = useMemo(() => {
    const alerts: Array<{
      id: string;
      title: string;
      description: string;
      href: string;
      hrefLabel: string;
      tone: "warning" | "danger" | "info";
      icon: React.ReactNode;
    }> = [];

    if (laneHealth.dueToday && dueTodayRows.length > 0) {
      alerts.push({
        id: "due-today",
        title: "Due-today collection queue is active",
        description: `${dueTodayRows.length} pending EMI rows are due today.`,
        href: "/admin/collections",
        hrefLabel: "Open Collections",
        tone: "warning",
        icon: <Clock className="h-4 w-4" />,
      });
    }

    if (laneHealth.overdue && overdueRows.length > 0) {
      alerts.push({
        id: "overdue",
        title: "Overdue recovery queue requires attention",
        description: `${overdueRows.length} overdue EMI rows with exposure ${money(overdueExposure)}.`,
        href: "/admin/emis/overdue",
        hrefLabel: "Open Overdue Queue",
        tone: "danger",
        icon: <AlertCircle className="h-4 w-4" />,
      });
    }

    const flaggedCount = reconciliationAttention?.flagged_count ?? 0;
    if (laneHealth.reconciliation && flaggedCount > 0) {
      alerts.push({
        id: "reconciliation",
        title: "Reconciliation mismatches need review",
        description: `${flaggedCount} subscription-level reconciliation rows were flagged.`,
        href: buildAdminReconciliationRoute(),
        hrefLabel: "Open Reconciliation",
        tone: "warning",
        icon: <Receipt className="h-4 w-4" />,
      });
    }

    const unsettledCount = Number(commissionSummary?.summary?.pending_count ?? 0);
    if (laneHealth.commissions && unsettledCount > 0) {
      alerts.push({
        id: "commissions",
        title: "Unsettled commissions pending finance review",
        description: `${unsettledCount} commission rows are still unsettled.`,
        href: "/admin/finance/commissions",
        hrefLabel: "Open Commission Finance",
        tone: "info",
        icon: <CreditCard className="h-4 w-4" />,
      });
    }

    const nextDrawBatch =
      dashboardSnapshot?.operations?.next_draw_batch ??
      dashboardSnapshot?.batches?.next_draw_batch;
    if (
      laneHealth.dashboard &&
      nextDrawBatch &&
      (nextDrawBatch.days_until_draw ?? 99) <= 5
    ) {
      alerts.push({
        id: "next-draw",
        title: "Upcoming draw window is close",
        description: `${nextDrawBatch.batch_code} draws in ${nextDrawBatch.days_until_draw ?? 0} day(s).`,
        href: buildAdminBatchRoute(nextDrawBatch.id),
        hrefLabel: "Open Batch",
        tone: "warning",
        icon: <Calendar className="h-4 w-4" />,
      });
    }

    return alerts.slice(0, 4);
  }, [
    laneHealth,
    dueTodayRows.length,
    overdueRows.length,
    overdueExposure,
    reconciliationAttention?.flagged_count,
    commissionSummary?.summary?.pending_count,
    dashboardSnapshot?.operations?.next_draw_batch,
    dashboardSnapshot?.batches?.next_draw_batch,
  ]);

  const recentReconciliationPreview = useMemo(
    () => (reconciliationAttention?.results ?? []).slice(0, 5),
    [reconciliationAttention]
  );

  const recentPaymentsPreview = useMemo(() => recentPayments.slice(0, 5), [recentPayments]);

  const activeSubscriptions = laneHealth.dashboard
    ? metricNumber(dashboardSnapshot?.subscriptions?.active)
    : null;
  const completedSubscriptions = laneHealth.dashboard
    ? metricNumber(dashboardSnapshot?.subscriptions?.completed)
    : null;
  const wonSubscriptions = laneHealth.dashboard
    ? metricNumber(dashboardSnapshot?.subscriptions?.won)
    : null;
  const pendingEmis = laneHealth.dashboard
    ? metricNumber(dashboardSnapshot?.emi?.pending)
    : null;
  const overdueEmis = laneHealth.dashboard
    ? metricNumber(dashboardSnapshot?.emi?.overdue)
    : null;
  const todayCollection = laneHealth.dashboard
    ? dashboardSnapshot?.collections?.today_net_amount ??
      dashboardSnapshot?.financial?.today_collection ??
      null
    : null;
  const totalOutstanding = laneHealth.dashboard
    ? dashboardSnapshot?.financial?.total_outstanding ?? null
    : null;
  const totalSubscriptions = laneHealth.subscriptionKpis
    ? subscriptionKpis?.total_subscriptions ?? null
    : null;
  const defaultedSubscriptions = laneHealth.subscriptionKpis
    ? subscriptionKpis?.defaulted_subscriptions ?? null
    : null;
  const totalContractValue = laneHealth.subscriptionKpis
    ? subscriptionKpis?.total_contract_value ?? null
    : null;
  const collectionRate = todayGrossCollectedAmount > 0
    ? ((todayCollectedAmount / todayGrossCollectedAmount) * 100).toFixed(1)
    : "0";
  const defaultRate = laneHealth.subscriptionKpis
    && totalSubscriptions !== null
    && defaultedSubscriptions !== null
    ? totalSubscriptions > 0
      ? ((defaultedSubscriptions / totalSubscriptions) * 100).toFixed(1)
      : "0.0"
    : null;
  const collectionRateDisplay = laneHealth.recentPayments ? `${collectionRate}%` : "—";
  const defaultRateDisplay = defaultRate === null ? "—" : `${defaultRate}%`;

  const dueTodayHealth = laneHealth.dueToday
    ? dueTodayRows.length > 0
      ? "warning"
      : "healthy"
    : "critical";
  const overdueHealth = laneHealth.overdue
    ? overdueRows.length > 0
      ? "critical"
      : "healthy"
    : "critical";
  const commissionHealth = laneHealth.commissions
    ? (commissionSummary?.summary?.pending_count ?? 0) > 0
      ? "warning"
      : "healthy"
    : "critical";
  const reconciliationHealth = laneHealth.reconciliation
    ? (reconciliationAttention?.flagged_count ?? 0) > 0
      ? "warning"
      : "healthy"
    : "critical";
  const nextDrawBatch =
    dashboardSnapshot?.operations?.next_draw_batch ??
    dashboardSnapshot?.batches?.next_draw_batch ??
    null;
  const batchHealth =
    laneHealth.dashboard && nextDrawBatch
      ? (nextDrawBatch.days_until_draw ?? 99) <= 5 ||
        (nextDrawBatch.available_slots ?? 999) <= 10
        ? "warning"
        : "healthy"
      : laneHealth.dashboard
        ? "healthy"
        : "critical";

  return (
    <PortalPage
      title="Admin Operations"
      subtitle="Monitor collections, recovery, reconciliation, and finance workflows from one operational control center."
      breadcrumbs={[{ label: "Admin" }]}
      actions={[
        { href: "/admin/collections", label: "Open Collections", variant: "primary" },
        { href: "/admin/payments", label: "Open Payments", variant: "secondary" },
      ]}
      stats={[]}
      statusBadge={{ label: "Operations Control Center", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void loadDashboard("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            {lastRefreshed && (
              <div className="text-xs text-muted-foreground">Last refreshed: {lastRefreshed.toLocaleTimeString()}</div>
            )}
          </div>
          <div className="flex gap-2">
            <QuickActionButton href="/admin/payments/create" icon={<PlusCircle className="h-4 w-4" />} label="Record Payment" />
            <QuickActionButton href="/admin/subscriptions/create" icon={<Zap className="h-4 w-4" />} label="New Subscription" />
            <QuickActionButton href="/admin/collections" icon={<DollarSign className="h-4 w-4" />} label="Collections" />
          </div>
        </div>

        {loading ? <LoadingBlock label="Loading admin operations dashboard..." /> : null}
        {!loading && error ? (
          <ErrorState title="Unable to load admin operations dashboard" description={error} onRetry={() => void loadDashboard("initial")} />
        ) : null}
        {!loading && !error && (
          <>
            {warnings.length > 0 && (
              <SectionCard title="Lane data warnings" description="Some dashboard lanes failed on the last refresh. The rest is still available.">
                <div className="space-y-3">
                  {warnings.map((warning) => (
                    <div key={warning.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <div className="font-medium text-foreground">{warning.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{warning.description}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* First KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Active Subscriptions"
                value={metricValue(activeSubscriptions)}
                icon={<BarChart3 className="h-4 w-4" />}
                tone="success"
                href="/admin/subscriptions?status=ACTIVE"
              />
              <KpiCard
                title="Pending EMIs"
                value={metricValue(pendingEmis)}
                icon={<Clock className="h-4 w-4" />}
                tone={pendingEmis && pendingEmis > 0 ? "warning" : "default"}
                href="/admin/emis/pending"
              />
              <KpiCard
                title="Overdue EMIs"
                value={metricValue(overdueEmis)}
                icon={<AlertCircle className="h-4 w-4" />}
                tone={overdueEmis && overdueEmis > 0 ? "danger" : "default"}
                href="/admin/emis/overdue"
              />
              <KpiCard
                title="Today Collection"
                value={moneyValue(todayCollection)}
                icon={<DollarSign className="h-4 w-4" />}
                tone="success"
                href="/admin/collections"
              />
            </div>

            {/* Second KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Total Outstanding"
                value={moneyValue(totalOutstanding)}
                icon={<TrendingDown className="h-4 w-4" />}
                tone="warning"
                href="/admin/reports/overdue"
              />
              <KpiCard
                title="Completed Subscriptions"
                value={metricValue(completedSubscriptions)}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone="success"
                href="/admin/subscriptions?status=COMPLETED"
              />
              <KpiCard
                title="Won Subscriptions"
                value={metricValue(wonSubscriptions)}
                icon={<Sparkles className="h-4 w-4" />}
                tone="default"
                href="/admin/subscriptions?status=WON"
              />
              <KpiCard
                title="Unsettled Commissions"
                value={laneHealth.commissions ? String(commissionSummary?.summary?.pending_count ?? 0) : "—"}
                icon={<Wallet className="h-4 w-4" />}
                tone={commissionSummary?.summary?.pending_count ? "warning" : "default"}
                href="/admin/finance/commissions"
              />
            </div>

            {/* Third KPI row */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                title="Total Subscriptions"
                value={metricValue(totalSubscriptions)}
                icon={<ClipboardList className="h-4 w-4" />}
                tone="default"
                href="/admin/subscriptions"
              />
              <KpiCard
                title="Defaulted Subscriptions"
                value={metricValue(defaultedSubscriptions)}
                icon={<XCircle className="h-4 w-4" />}
                tone={defaultedSubscriptions && defaultedSubscriptions > 0 ? "danger" : "default"}
                href="/admin/subscriptions?status=DEFAULTED"
              />
              <KpiCard
                title="Net Posting Ratio"
                value={laneHealth.recentPayments ? `${collectionRate}%` : "—"}
                icon={<Percent className="h-4 w-4" />}
                trend={laneHealth.recentPayments ? (Number(collectionRate) > 70 ? "up" : "down") : undefined}
                trendValue={
                  laneHealth.recentPayments
                    ? `${recentPaymentsSummary.active_payments} of ${recentPaymentsSummary.visible_payments} posted rows remain active today`
                    : undefined
                }
                tone={laneHealth.recentPayments ? (Number(collectionRate) > 70 ? "success" : "warning") : "default"}
                progress={laneHealth.recentPayments ? Number(collectionRate) : undefined}
                progressValue="active vs gross today"
                href="/admin/collections"
              />
              <KpiCard
                title="Total Contract Value"
                value={moneyValue(totalContractValue)}
                icon={<Package className="h-4 w-4" />}
                tone="success"
                href="/admin/reports"
              />
            </div>

            {/* Small chart preview for PieChart */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <PieChart className="h-5 w-5 text-primary" />
                <h3 className="text-base font-semibold text-foreground">Performance Summary</h3>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground">Collection Rate</div>
                  <div className="text-xl font-semibold text-foreground">{collectionRateDisplay}</div>
                  <div className="mt-1 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${laneHealth.recentPayments ? Number(collectionRate) : 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Default Rate</div>
                  <div className="text-xl font-semibold text-foreground">{defaultRateDisplay}</div>
                  <div className="mt-1 h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-destructive"
                      style={{
                        width: `${defaultRate === null ? 0 : Math.min(100, Number(defaultRate))}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Lane Cards */}
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-5">
              <LaneCard
                eyebrow="Collections"
                title="Today Collections"
                description="Current-day queue and recent posted collections."
                value={laneHealth.dueToday ? String(dueTodayRows.length) : "Unavailable"}
                secondaryValue={
                  laneHealth.recentPayments
                    ? `${recentPaymentsSummary.active_payments} active today · ${money(todayCollectedAmount)} net collected`
                    : "Today payment posting lane unavailable"
                }
                primaryHref="/admin/collections"
                primaryLabel="Open Collections"
                secondaryHref="/admin/payments/create"
                secondaryLabel="Admin Collection"
                tone="warning"
                icon={<Calendar className="h-5 w-5" />}
                healthStatus={dueTodayHealth}
              />
              <LaneCard
                eyebrow="Recovery"
                title="Overdue Follow-up"
                description="Past-due pending EMI rows needing recovery action."
                value={laneHealth.overdue ? String(overdueRows.length) : "Unavailable"}
                secondaryValue={
                  laneHealth.overdue
                    ? `${money(overdueExposure)} exposure · ${oldestOverdue} days oldest`
                    : "Overdue recovery lane unavailable"
                }
                primaryHref="/admin/emis/overdue"
                primaryLabel="Open Overdue Queue"
                secondaryHref="/admin/subscriptions"
                secondaryLabel="Open Subscriptions"
                tone={laneHealth.overdue && overdueRows.length > 0 ? "danger" : "warning"}
                icon={<AlertCircle className="h-5 w-5" />}
                healthStatus={overdueHealth}
              />
              <LaneCard
                eyebrow="Finance"
                title="Commission Finance"
                description="Unsettled, settled, and payout workflow monitoring."
                value={
                  laneHealth.commissions
                    ? money(commissionSummary?.summary?.pending_commission ?? 0)
                    : "Unavailable"
                }
                secondaryValue={
                  laneHealth.commissions
                    ? `${Number(commissionSummary?.summary?.pending_count ?? 0)} unsettled rows`
                    : "Commission finance lane unavailable"
                }
                primaryHref="/admin/finance/commissions"
                primaryLabel="Open Commission Finance"
                secondaryHref="/admin/finance/payout-batches"
                secondaryLabel="Payout Batches"
                tone="default"
                icon={<CreditCard className="h-5 w-5" />}
                healthStatus={commissionHealth}
              />
              <LaneCard
                eyebrow="Batches"
                title="Next Draw Pressure"
                description="Live batch draw timing and slot pressure from the current active book."
                value={nextDrawBatch ? nextDrawBatch.batch_code : "No live batch"}
                secondaryValue={
                  nextDrawBatch
                    ? `${nextDrawBatch.days_until_draw ?? 0} days · ${nextDrawBatch.subscription_count ?? 0}/${nextDrawBatch.total_slots ?? 0} sold`
                    : laneHealth.dashboard
                      ? "No open or draw-active batch was returned."
                      : "Batch pressure lane unavailable"
                }
                primaryHref="/admin/batches"
                primaryLabel="Open Batches"
                secondaryHref={
                  nextDrawBatch ? buildAdminBatchRoute(nextDrawBatch.id) : "/admin/lucky-draws"
                }
                secondaryLabel={nextDrawBatch ? "Open Batch" : "Lucky Draws"}
                tone={nextDrawBatch ? "warning" : "default"}
                icon={<Package className="h-5 w-5" />}
                healthStatus={batchHealth}
              />
              <LaneCard
                eyebrow="Reconciliation"
                title="Reconciliation Attention"
                description="Subscription-level mismatch attention and payment-level follow-up."
                value={
                  laneHealth.reconciliation
                    ? String(reconciliationAttention?.flagged_count ?? 0)
                    : "Unavailable"
                }
                secondaryValue={
                  laneHealth.reconciliation
                    ? `${String(reconciliationAttention?.checked_count ?? 0)} checked rows`
                    : "Reconciliation lane unavailable"
                }
                primaryHref={buildAdminReconciliationRoute()}
                primaryLabel="Open Reconciliation"
                secondaryHref={buildAdminReconciliationRoute({ view: "payments" })}
                secondaryLabel="Payment Reconciliation"
                tone="default"
                icon={<Receipt className="h-5 w-5" />}
                healthStatus={reconciliationHealth}
              />
            </div>

            {/* Priority Alerts */}
            <SectionCard
              title="Priority Alerts"
              description="Only real workflow attention items are shown here."
              actionHref="/admin/collections"
              actionLabel="Open Collections"
              footer={priorityAlerts.length > 0 ? <div className="text-xs text-muted-foreground">{priorityAlerts.length} active alert(s)</div> : undefined}
            >
              {priorityAlerts.length === 0 ? (
                <EmptyState title="No priority alerts" description="No immediate collection, recovery, reconciliation, or commission exceptions are currently flagged." />
              ) : (
                <div className="space-y-3">
                  {priorityAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`rounded-xl border p-4 transition hover:shadow-sm ${
                        alert.tone === "danger"
                          ? "border-red-200 bg-red-50/50"
                          : alert.tone === "warning"
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-border bg-muted/30"
                      }`}
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex gap-3">
                          <div className="mt-0.5 shrink-0 text-muted-foreground">{alert.icon}</div>
                          <div>
                            <div className="font-medium text-foreground">{alert.title}</div>
                            <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
                          </div>
                        </div>
                        <Link
                          href={alert.href}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted"
                        >
                          {alert.hrefLabel}
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* Two column data sections */}
            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard
                title="Recent Collections Posted Today"
                description="Latest posted payments for operational verification. Net collection excludes reversed payments."
                actionHref="/admin/payments"
                actionLabel="View All"
              >
                {!laneHealth.recentPayments ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Recent payments lane did not load on the last refresh.
                  </div>
                ) : recentPaymentsPreview.length === 0 ? (
                  <EmptyState title="No collections posted today" description="No posted payments were returned for today." />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-xl border border-border bg-background px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross Amount</div>
                        <div className="mt-1 text-lg font-semibold text-foreground">{money(todayGrossCollectedAmount)}</div>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Reversed Amount</div>
                        <div className="mt-1 text-lg font-semibold text-amber-800">{money(todayReversedAmount)}</div>
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Net Collected</div>
                        <div className="mt-1 text-lg font-semibold text-emerald-800">{money(todayCollectedAmount)}</div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {recentPaymentsPreview.map((payment) => (
                        <PaymentRow key={payment.id} payment={payment} />
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Reconciliation Attention Preview"
                description="Subscription-level mismatches needing follow-up. Open the full reconciliation page for complete review."
                actionHref={buildAdminReconciliationRoute()}
                actionLabel="View All"
              >
                {!laneHealth.reconciliation ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Reconciliation attention lane did not load on the last refresh.
                  </div>
                ) : recentReconciliationPreview.length === 0 ? (
                  <EmptyState title="No reconciliation attention rows" description="No subscription-level mismatches are currently flagged." />
                ) : (
                  <div className="space-y-3">
                    {recentReconciliationPreview.map((row) => (
                      <ReconciliationRow key={`${row.subscription_id}`} row={row} />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </PortalPage>
  );
}
