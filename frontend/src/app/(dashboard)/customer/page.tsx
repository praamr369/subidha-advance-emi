"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Gift,
  HelpCircle,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  Truck,
  Users,
} from "lucide-react";
import UpiPayDialog from "@/components/payments/UpiPayDialog";
import { listPublicProducts, type PublicProduct } from "@/services/public";
import { resolveApiMediaUrl } from "@/lib/media";
import StatusBadge from "@/components/ui/status-badge";
import { ROUTES } from "@/lib/routes";
import {
  getCustomerDashboard,
  getCustomerDirectSaleSummary,
  listCustomerDirectSales,
  type CustomerDirectSaleListItem,
  type CustomerSubscription,
} from "@/services/customer";
import { listCustomerDeliveries, type DeliveryReportSummary } from "@/services/deliveries";
import { listCustomerSupportTickets } from "@/services/support";
import {
  getDashboardSummaryV2,
  listDashboardOverdue,
  listDashboardRecentPayments,
  listDashboardUpcoming,
  listDashboardWinners,
  normalizeDashboardSummary,
} from "@/services/dashboards";
import {
  getCustomerNotificationSummary,
  type NotificationSummaryResponse,
} from "@/services/notifications";

function money(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function planLabel(planType?: string): string {
  const pt = (planType || "").toUpperCase();
  if (pt === "EMI") return "Advance EMI";
  if (pt === "RENT") return "Rent";
  if (pt === "LEASE") return "Lease";
  return pt || "Advance EMI";
}

function planBadgeClass(planType?: string): string {
  const pt = (planType || "").toUpperCase();
  if (pt === "EMI") return "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300";
  if (pt === "RENT") return "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
  if (pt === "LEASE") return "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300";
  return "bg-muted text-muted-foreground";
}

export default function CustomerDashboardPage() {
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [selectedDuePayItem, setSelectedDuePayItem] = useState<{
    subscription_number?: string | null;
    pending_amount?: string | number | null;
    amount?: string | number | null;
    due_date?: string | null;
    product_name?: string | null;
    emi_id?: number | string | null;
    subscription_id?: number | string | null;
  } | null>(null);

  const coreQuery = useQuery({
    queryKey: ["customer", "dashboard", "core"],
    queryFn: getCustomerDashboard,
  });

  const canonicalQuery = useQuery({
    queryKey: ["customer", "dashboard", "summary"],
    queryFn: () => getDashboardSummaryV2({}),
    enabled: coreQuery.isSuccess,
  });

  const overdueQuery = useQuery({
    queryKey: ["customer", "dashboard", "overdue"],
    queryFn: () => listDashboardOverdue({ limit: 6 }),
    enabled: coreQuery.isSuccess,
  });

  const upcomingQuery = useQuery({
    queryKey: ["customer", "dashboard", "upcoming"],
    queryFn: () => listDashboardUpcoming({ limit: 6 }),
    enabled: coreQuery.isSuccess,
  });

  const recentPaymentsQuery = useQuery({
    queryKey: ["customer", "dashboard", "recent-payments"],
    queryFn: () => listDashboardRecentPayments({ limit: 6 }),
    enabled: coreQuery.isSuccess,
  });

  const winnersQuery = useQuery({
    queryKey: ["customer", "dashboard", "winners"],
    queryFn: () => listDashboardWinners({ limit: 4 }),
    enabled: coreQuery.isSuccess,
  });

  const directSaleSummaryQuery = useQuery({
    queryKey: ["customer", "dashboard", "direct-sale-summary"],
    queryFn: getCustomerDirectSaleSummary,
    enabled: coreQuery.isSuccess,
  });

  const directSalesQuery = useQuery({
    queryKey: ["customer", "dashboard", "direct-sales", 1, 5],
    queryFn: () => listCustomerDirectSales({ page: 1, pageSize: 5 }),
    enabled: coreQuery.isSuccess,
  });

  const notificationSummaryQuery = useQuery({
    queryKey: ["customer", "dashboard", "notification-summary"],
    queryFn: getCustomerNotificationSummary,
    enabled: coreQuery.isSuccess,
  });

  const deliveriesQuery = useQuery({
    queryKey: ["customer", "dashboard", "deliveries"],
    queryFn: () => listCustomerDeliveries(),
    enabled: coreQuery.isSuccess,
  });

  const supportQuery = useQuery({
    queryKey: ["customer", "dashboard", "support", "open"],
    queryFn: () => listCustomerSupportTickets("open"),
    enabled: coreQuery.isSuccess,
  });

  const productsQuery = useQuery({
    queryKey: ["publicProducts", "dashboard"],
    queryFn: () => listPublicProducts(),
    staleTime: 5 * 60 * 1000,
  });

  const legacy = coreQuery.data ?? null;
  const canonical = canonicalQuery.data ?? null;
  const summary =
    canonical?.summary ??
    (legacy?.summary
      ? normalizeDashboardSummary(legacy.summary as unknown as Record<string, unknown>)
      : undefined);

  const loading = coreQuery.isPending;
  const refreshing = [
    coreQuery,
    canonicalQuery,
    overdueQuery,
    upcomingQuery,
    recentPaymentsQuery,
    winnersQuery,
    directSaleSummaryQuery,
    directSalesQuery,
    notificationSummaryQuery,
    deliveriesQuery,
    supportQuery,
  ].some((q) => q.isFetching && !q.isPending);

  const error = coreQuery.error
    ? (coreQuery.error instanceof Error ? coreQuery.error.message : "Failed to load customer workspace.")
    : null;

  function refreshDashboard() {
    void coreQuery.refetch();
    void canonicalQuery.refetch();
    void overdueQuery.refetch();
    void upcomingQuery.refetch();
    void recentPaymentsQuery.refetch();
    void winnersQuery.refetch();
    void directSaleSummaryQuery.refetch();
    void directSalesQuery.refetch();
    void notificationSummaryQuery.refetch();
    void deliveriesQuery.refetch();
    void supportQuery.refetch();
  }

  const dueRows = useMemo(
    () => [...(overdueQuery.data?.results ?? []), ...(upcomingQuery.data?.results ?? [])].slice(0, 6),
    [overdueQuery.data, upcomingQuery.data]
  );
  const paymentRows = useMemo(
    () => recentPaymentsQuery.data?.results ?? [],
    [recentPaymentsQuery.data]
  );
  const lastPayment = paymentRows[0] ?? null;

  const directSaleSummary = directSaleSummaryQuery.data ?? null;
  const latestDirectSales: CustomerDirectSaleListItem[] = directSalesQuery.data?.results ?? [];
  const notificationSummary: NotificationSummaryResponse | null = notificationSummaryQuery.data ?? null;
  const deliverySummary: DeliveryReportSummary | null = deliveriesQuery.data?.summary ?? null;
  const inFlightDeliveries = deliverySummary
    ? deliverySummary.pending +
      deliverySummary.scheduled +
      deliverySummary.in_transit +
      deliverySummary.dispatched +
      deliverySummary.out_for_delivery
    : 0;

  const publicProducts: PublicProduct[] = productsQuery.data?.products ?? [];

  const activeSubs: CustomerSubscription[] = useMemo(() => {
    return (legacy?.subscriptions ?? []).slice(0, 3);
  }, [legacy?.subscriptions]);

  const hasNextDue = Boolean(summary?.next_due_amount && Number(summary.next_due_amount) > 0);

  return (
    <div className="w-full px-3.5 py-4 space-y-4 max-w-full">
      {/* ── 1. Top Customer Profile Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-base shadow-xs">
            {((legacy?.customer?.name || "C").charAt(0) || "C").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-foreground truncate">
              {legacy?.customer?.name || "Customer Workspace"}
            </h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={legacy?.customer?.kyc_status || "PENDING"} />
              {legacy?.customer?.phone ? (
                <span className="text-xs font-medium text-muted-foreground">{legacy.customer.phone}</span>
              ) : null}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={refreshDashboard}
          disabled={loading || refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-xs transition hover:bg-muted active:scale-95 disabled:opacity-60"
          title="Refresh dashboard"
        >
          <RefreshCw className={`size-4.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Loading / Error State ── */}
      {loading ? (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-2xl border border-border bg-muted/50" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className="h-20 animate-pulse rounded-2xl border border-border bg-muted/40" />
            <div className="h-20 animate-pulse rounded-2xl border border-border bg-muted/40" />
          </div>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="font-bold">Unable to load dashboard</div>
          <p className="mt-1 text-xs opacity-90">{error}</p>
          <button
            type="button"
            onClick={refreshDashboard}
            className="mt-3 inline-flex rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!loading && !error && summary ? (
        <>
          {/* ── 2. Next EMI Due - Hero Action Banner ── */}
          {hasNextDue ? (
            <div className="overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-background dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Clock className="size-3.5" /> Next EMI Due
                </span>
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Due {formatDate(summary.next_due_date)}
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-3xl font-black tracking-tight text-foreground">
                    {money(summary.next_due_amount)}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                    {summary.next_due_subscription_number || "Active Contract"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedDuePayItem({
                    subscription_number: summary.next_due_subscription_number || undefined,
                    pending_amount: summary.next_due_amount,
                    due_date: summary.next_due_date || undefined,
                  })
                }
                className="mt-3.5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98]"
              >
                <Smartphone className="size-4.5" />
                <span>Pay Now via UPI / Autopay</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 shadow-xs">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <CheckCircle2 className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  All Payments Up to Date!
                </div>
                <div className="text-xs text-emerald-700/80 dark:text-emerald-400">
                  No pending EMIs due at this time.
                </div>
              </div>
            </div>
          )}

          {/* ── 3. At-a-Glance KPI Grid (2x2) ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <Link
              href={ROUTES.customer.subscriptions}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Contracts</span>
                <Package className="size-4 text-primary" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">{summary.active_subscriptions ?? 0}</div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {summary.completed_subscriptions ?? 0} completed
                </div>
              </div>
            </Link>

            <Link
              href={ROUTES.customer.payments}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Last Paid</span>
                <CreditCard className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {lastPayment ? money(lastPayment.amount) : "—"}
                </div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                  {lastPayment ? formatDate(lastPayment.payment_date || lastPayment.created_at) : "No payments yet"}
                </div>
              </div>
            </Link>

            <Link
              href={ROUTES.customer.deliveries}
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Deliveries</span>
                <Truck className="size-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {deliverySummary ? deliverySummary.delivered : 0}
                </div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                  {inFlightDeliveries > 0 ? `${inFlightDeliveries} in progress` : "All delivered"}
                </div>
              </div>
            </Link>

            <Link
              href="/customer/lucky-plan/lucky-id"
              className="flex flex-col justify-between rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/40 active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">SFEMI Benefit</span>
                <Star className="size-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl font-black text-foreground">
                  {summary.winner_subscriptions ?? 0}
                </div>
                <div className="mt-0.5 text-xs font-medium text-muted-foreground truncate">
                  {Number(summary.total_waived_amount ?? 0) > 0
                    ? `${money(summary.total_waived_amount)} waived`
                    : "Active benefits"}
                </div>
              </div>
            </Link>
          </div>

          {/* ── 4. Quick Access Lanes (Large Touch Targets) ── */}
          <div className="space-y-2">
            <h2 className="text-sm font-bold text-foreground">Quick Access</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href={ROUTES.customer.subscriptions}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                  <Package className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">My Contracts</div>
                  <div className="text-[11px] font-medium text-muted-foreground">EMI, Rent &amp; Lease</div>
                </div>
              </Link>

              <Link
                href="/customer/emis"
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CreditCard className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">EMI Schedule</div>
                  <div className="text-[11px] font-medium text-muted-foreground">View &amp; Pay EMIs</div>
                </div>
              </Link>

              <Link
                href={ROUTES.customer.payments}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <Receipt className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">Payments</div>
                  <div className="text-[11px] font-medium text-muted-foreground">History &amp; Receipts</div>
                </div>
              </Link>

              <Link
                href="/customer/lucky-plan/lucky-id"
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  <Star className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">My SFEMI ID</div>
                  <div className="text-[11px] font-medium text-muted-foreground">Benefit status &amp; ID</div>
                </div>
              </Link>

              <Link
                href={ROUTES.customer.deliveries}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                  <Truck className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">Deliveries</div>
                  <div className="text-[11px] font-medium text-muted-foreground">Track shipments</div>
                </div>
              </Link>

              <Link
                href="/customer/invoices"
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <FileText className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">Invoices</div>
                  <div className="text-[11px] font-medium text-muted-foreground">Download PDFs</div>
                </div>
              </Link>

              <Link
                href={ROUTES.customer.support}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  <HelpCircle className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">Support</div>
                  <div className="text-[11px] font-medium text-muted-foreground">Tickets &amp; Help</div>
                </div>
              </Link>

              <Link
                href="/customer/catalog"
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/50 active:scale-[0.98]"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                  <ShoppingBag className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground leading-tight">Catalog</div>
                  <div className="text-[11px] font-medium text-muted-foreground">Explore Products</div>
                </div>
              </Link>
            </div>
          </div>

          {/* ── 5. Due Collection Queue (Upcoming & Overdue) ── */}
          {dueRows.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">
                  Instalments Due ({dueRows.length})
                </h2>
                <Link href="/customer/emis" className="text-xs font-bold text-primary hover:underline">
                  View all →
                </Link>
              </div>

              <div className="space-y-2">
                {dueRows.map((item) => {
                  const isOverdue = Boolean(item.is_overdue);
                  return (
                    <div
                      key={`${item.subscription_id ?? item.id}-${item.emi_id ?? "na"}`}
                      className={`rounded-2xl border p-3.5 shadow-xs transition ${
                        isOverdue
                          ? "border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-bold text-foreground truncate">
                              {item.product_name || "Contract Item"}
                            </span>
                            {isOverdue ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                Overdue {item.overdue_days ? `${item.overdue_days}d` : ""}
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                Due Soon
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {item.subscription_number || `SUB-${item.subscription_id ?? item.id}`} · Due {formatDate(item.due_date)}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-base font-black text-foreground">
                            {money(item.pending_amount)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">Pending</div>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-border/60 pt-2.5">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedDuePayItem({
                              subscription_number: item.subscription_number,
                              product_name: item.product_name,
                              pending_amount: item.pending_amount,
                              due_date: item.due_date,
                              emi_id: item.emi_id,
                              subscription_id: item.subscription_id,
                            })
                          }
                          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.98]"
                        >
                          <Smartphone className="size-4" />
                          <span>Pay {money(item.pending_amount)} via UPI</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── 6. Active Subscriptions Overview ── */}
          {activeSubs.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">My Subscriptions</h2>
                <Link href={ROUTES.customer.subscriptions} className="text-xs font-bold text-primary hover:underline">
                  All ({summary.subscription_count ?? activeSubs.length}) →
                </Link>
              </div>

              <div className="space-y-2.5">
                {activeSubs.map((sub) => (
                  <Link
                    key={sub.id}
                    href={`${ROUTES.customer.subscriptions}/${sub.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs transition hover:bg-muted/40 active:scale-[0.98]"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <Package className="size-6 text-primary/70" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-foreground truncate">
                          {sub.product_name || `Contract #${sub.id}`}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${planBadgeClass(sub.plan_type)}`}>
                          {planLabel(sub.plan_type)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {sub.subscription_number || `SUB-${sub.id}`}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="font-bold text-foreground">{money(sub.monthly_amount)}/mo</span>
                        {sub.outstanding_amount ? (
                          <span className="text-muted-foreground">· Rem: {money(sub.outstanding_amount)}</span>
                        ) : null}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" />
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── 7. Direct Sale Dues (if any) ── */}
          {directSaleSummary && Number(directSaleSummary.total_outstanding_direct_sale_dues ?? 0) > 0 ? (
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 shadow-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Direct Sale Balance Due
                </span>
                <Link href={ROUTES.customer.directSales} className="text-xs font-bold text-amber-700 hover:underline">
                  View Sales →
                </Link>
              </div>
              <div className="mt-1 text-2xl font-black text-foreground">
                {money(directSaleSummary.total_outstanding_direct_sale_dues)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Total paid: {money(directSaleSummary.total_paid_direct_sale_amount)}
              </div>
            </div>
          ) : null}

          {/* ── 8. Recent Payments ── */}
          {paymentRows.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Recent Payments</h2>
                <Link href={ROUTES.customer.payments} className="text-xs font-bold text-primary hover:underline">
                  See all →
                </Link>
              </div>

              <div className="space-y-2">
                {paymentRows.slice(0, 4).map((p) => (
                  <div
                    key={p.payment_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-xs"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      <BadgeCheck className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-foreground truncate">
                        {p.subscription_number || `Payment #${p.payment_id}`}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.method || "Online"} {p.reference_no ? `· Ref ${p.reference_no}` : ""}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {money(p.amount)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatDate(p.payment_date || p.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── 9. Browse Products Catalog Preview ── */}
          {publicProducts.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-foreground">Explore Catalog</h2>
                  <p className="text-[11px] text-muted-foreground">Available for EMI, Rent, Lease, or Direct Purchase</p>
                </div>
                <Link href="/customer/catalog" className="text-xs font-bold text-primary hover:underline">
                  View catalog →
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {publicProducts.slice(0, 4).map((product) => {
                  const imgUrl = resolveApiMediaUrl(product.image ?? null);
                  return (
                    <Link
                      key={product.id}
                      href={`/customer/catalog/${product.id}`}
                      className="group overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition hover:shadow-md active:scale-[0.98]"
                    >
                      {imgUrl ? (
                        <div className="relative h-28 w-full overflow-hidden bg-muted">
                          <Image
                            src={imgUrl}
                            alt={product.name}
                            fill
                            className="object-cover transition group-hover:scale-105"
                            sizes="50vw"
                          />
                        </div>
                      ) : (
                        <div className="flex h-28 items-center justify-center bg-muted/40">
                          <Package className="size-8 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="p-3">
                        <div className="truncate text-xs font-bold text-foreground">{product.name}</div>
                        <div className="mt-1 text-sm font-black text-foreground">
                          {money(product.base_price)}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-primary">
                          <span>Details</span>
                          <ArrowRight className="size-3" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ── 10. Recent Notifications ── */}
          {notificationSummary && (notificationSummary.latest?.length ?? 0) > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Recent Updates</h2>
                <Link href="/customer/notifications" className="text-xs font-bold text-primary hover:underline">
                  All ({notificationSummary.unread_count ?? 0} unread) →
                </Link>
              </div>

              <div className="space-y-2">
                {(notificationSummary.latest ?? []).slice(0, 3).map((n) => (
                  <div key={n.id} className="rounded-2xl border border-border bg-card p-3.5 shadow-xs">
                    <div className="text-xs font-bold text-foreground">{n.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
                      {n.body}
                    </div>
                    <div className="mt-1.5 text-[10px] font-medium text-muted-foreground">
                      {formatDate(n.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* ── UPI / Autopay Dialog ── */}
      {selectedDuePayItem ? (
        <UpiPayDialog
          isOpen={Boolean(selectedDuePayItem)}
          onClose={() => setSelectedDuePayItem(null)}
          amount={selectedDuePayItem.pending_amount || selectedDuePayItem.amount || 0}
          subscriptionNumber={selectedDuePayItem.subscription_number || undefined}
          productName={selectedDuePayItem.product_name || undefined}
          dueDate={selectedDuePayItem.due_date ? formatDate(selectedDuePayItem.due_date) : undefined}
          sourceType="EMI"
          sourceId={selectedDuePayItem.emi_id || undefined}
          onPaymentReported={() => {
            void canonicalQuery.refetch();
            void overdueQuery.refetch();
          }}
        />
      ) : null}
    </div>
  );
}
