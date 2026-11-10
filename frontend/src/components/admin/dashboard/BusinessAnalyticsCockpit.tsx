"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Factory,
  Layers,
  Minus,
  PackageSearch,
  Percent,
  PieChart,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

import type {
  DashboardBusinessAnalytics,
  DashboardDailyTrendPoint,
  DashboardMonthlyTrendPoint,
} from "@/services/admin";
import { money } from "@/lib/dashboard-summary";
import { ROUTES } from "@/lib/routes";

type Props = {
  analytics?: DashboardBusinessAnalytics | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
};

type TabType = "all" | "sales" | "inventory" | "staff";
type TrendTimeframe = "daily" | "monthly";

export default function BusinessAnalyticsCockpit({
  analytics,
  onRefresh,
  isRefreshing,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [trendTimeframe, setTrendTimeframe] = useState<TrendTimeframe>("daily");
  const [hoveredDataPoint, setHoveredDataPoint] = useState<
    DashboardDailyTrendPoint | DashboardMonthlyTrendPoint | null
  >(null);
  const [activeStreamFilter, setActiveStreamFilter] = useState<
    "all" | "sfemi" | "direct_sales" | "rent_lease"
  >("all");

  const sales = analytics?.sales;
  const inventory = analytics?.inventory;
  const staff = analytics?.staff;

  // Compute graph scaling for 30-day daily trends
  const dailyTrends = sales?.daily_trends ?? [];
  const monthlyTrends = sales?.monthly_trends ?? [];

  const maxDailyValue = useMemo(() => {
    if (!dailyTrends.length) return 100;
    const maxVal = Math.max(
      ...dailyTrends.map((d) => {
        if (activeStreamFilter === "sfemi") return d.sfemi;
        if (activeStreamFilter === "direct_sales") return d.direct_sales;
        if (activeStreamFilter === "rent_lease") return d.rent_lease;
        return d.total_net;
      }),
      100
    );
    return Math.ceil(maxVal * 1.15);
  }, [dailyTrends, activeStreamFilter]);

  const maxMonthlyValue = useMemo(() => {
    if (!monthlyTrends.length) return 1000;
    const maxVal = Math.max(
      ...monthlyTrends.map((m) => {
        if (activeStreamFilter === "sfemi") return m.sfemi;
        if (activeStreamFilter === "direct_sales") return m.direct_sales;
        if (activeStreamFilter === "rent_lease") return m.rent_lease;
        return m.net;
      }),
      1000
    );
    return Math.ceil(maxVal * 1.15);
  }, [monthlyTrends, activeStreamFilter]);

  if (!analytics) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="enterprise-eyebrow text-xs uppercase tracking-wider text-muted-foreground">
              Mathematical Intelligence
            </div>
            <h3 className="mt-1 text-base font-semibold text-foreground">
              Business Analytics & Performance Intelligence
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Aggregated mathematical metrics across Sales, Inventory Valuation, and Staff Manufacturing Labor.
            </p>
          </div>
          {onRefresh ? (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {isRefreshing ? "Loading..." : "Load Analytics"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
      {/* Cockpit Header & Navigation Tabs */}
      <div className="flex flex-col gap-4 border-b border-border/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Enterprise Math Intelligence · Live Backend Algorithmic Feed
            </span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-foreground sm:text-xl">
            Business Analytics & Performance Cockpit
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Strict append-only financial accounting, stock health valuation, and manufacturing labor accruals.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
          {[
            { id: "all", label: "Overview", icon: Layers },
            { id: "sales", label: "Sales & Streams", icon: DollarSign },
            { id: "inventory", label: "Inventory & Purchasing", icon: Boxes },
            { id: "staff", label: "Staff & Manufacturing", icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TOP EXECUTIVE METRICS ROW */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Monthly Net Sales & MoM Growth */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Month Net Revenue
            </span>
            <span className="rounded-full bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {money(sales?.current_month_net)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {sales?.growth_direction === "up" ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <TrendingUp className="h-3.5 w-3.5" />
                +{sales?.growth_rate_pct}%
              </span>
            ) : sales?.growth_direction === "down" ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                <TrendingDown className="h-3.5 w-3.5" />
                {sales?.growth_rate_pct}%
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Minus className="h-3.5 w-3.5" />
                0.0%
              </span>
            )}
            <span className="text-muted-foreground">vs prev month ({money(sales?.prev_month_net)})</span>
          </div>
        </div>

        {/* Card 2: Collection Efficiency & AOV */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Collection Efficiency
            </span>
            <span className="rounded-full bg-sky-100 p-1.5 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400">
              <Percent className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {sales?.collection_efficiency_pct ?? 0}%
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>AOV: <strong className="text-foreground">{money(sales?.aov)}</strong></span>
            <span>{sales?.total_transactions_month ?? 0} txns</span>
          </div>
        </div>

        {/* Card 3: Stock Valuation & Healthy Ratio */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Inventory Valuation
            </span>
            <span className="rounded-full bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
              <Boxes className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {money(inventory?.total_valuation)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{inventory?.total_skus ?? 0} SKUs active</span>
            <span className={inventory?.stock_health?.low_stock_count ? "font-bold text-amber-600 dark:text-amber-400" : ""}>
              {inventory?.stock_health?.low_stock_count ?? 0} reorder alerts
            </span>
          </div>
        </div>

        {/* Card 4: Staff Attendance & Labor Ratio */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Staff & Labor Accrual
            </span>
            <span className="rounded-full bg-indigo-100 p-1.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Users className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {staff?.attendance?.attendance_rate_pct ?? 0}%
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{staff?.active_staff_count ?? 0} active staff</span>
            <span>Labor/Rev: <strong className="text-foreground">{staff?.payroll?.labor_to_revenue_ratio_pct ?? 0}%</strong></span>
          </div>
        </div>
      </div>

      {/* SECTION 1: SALES & REVENUE TRENDS (Rendered if tab is 'all' or 'sales') */}
      {(activeTab === "all" || activeTab === "sales") && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Revenue & Collection Trend Analysis
              </h3>
              <p className="text-xs text-muted-foreground">
                Compare multi-stream throughput (SFEMI vs Direct Retail Sales vs Rent/Lease).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Stream filter */}
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveStreamFilter("all")}
                  className={`rounded-md px-2.5 py-1 ${
                    activeStreamFilter === "all"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All Streams
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStreamFilter("sfemi")}
                  className={`rounded-md px-2.5 py-1 ${
                    activeStreamFilter === "sfemi"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  SFEMI
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStreamFilter("direct_sales")}
                  className={`rounded-md px-2.5 py-1 ${
                    activeStreamFilter === "direct_sales"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Direct Sales
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStreamFilter("rent_lease")}
                  className={`rounded-md px-2.5 py-1 ${
                    activeStreamFilter === "rent_lease"
                      ? "bg-violet-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Rent/Lease
                </button>
              </div>

              {/* Timeframe selector */}
              <div className="flex items-center rounded-lg border border-border bg-background p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTrendTimeframe("daily")}
                  className={`rounded-md px-2.5 py-1 ${
                    trendTimeframe === "daily"
                      ? "bg-muted font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  30-Day Daily
                </button>
                <button
                  type="button"
                  onClick={() => setTrendTimeframe("monthly")}
                  className={`rounded-md px-2.5 py-1 ${
                    trendTimeframe === "monthly"
                      ? "bg-muted font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  6-Month Trajectory
                </button>
              </div>
            </div>
          </div>

          {/* SVG CHART CONTAINER */}
          <div className="relative rounded-xl border border-border bg-card p-4 shadow-xs">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">
                {trendTimeframe === "daily"
                  ? "Daily Collection & Sales Pulse (Last 30 Days)"
                  : "Monthly Settled Volume & Net Revenue (Last 6 Months)"}
              </span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" />
                  SFEMI
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-indigo-500" />
                  Direct Sales
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-violet-500" />
                  Rent & Lease
                </span>
              </div>
            </div>

            {/* Interactive SVG Bar Chart */}
            <div className="relative h-48 w-full select-none pt-2">
              {trendTimeframe === "daily" ? (
                <div className="flex h-full items-end gap-1 sm:gap-1.5">
                  {dailyTrends.map((d, idx) => {
                    const activeVal =
                      activeStreamFilter === "sfemi"
                        ? d.sfemi
                        : activeStreamFilter === "direct_sales"
                        ? d.direct_sales
                        : activeStreamFilter === "rent_lease"
                        ? d.rent_lease
                        : d.total_net;
                    const heightPct = Math.max(
                      3,
                      Math.round((activeVal / maxDailyValue) * 100)
                    );

                    return (
                      <div
                        key={d.date}
                        onMouseEnter={() => setHoveredDataPoint(d)}
                        onMouseLeave={() => setHoveredDataPoint(null)}
                        className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                      >
                        {/* Stacked bar or single bar depending on active filter */}
                        <div
                          className="w-full rounded-t-xs transition-all duration-300 group-hover:brightness-110 flex flex-col justify-end overflow-hidden"
                          style={{ height: `${heightPct}%` }}
                        >
                          {activeStreamFilter === "all" ? (
                            <>
                              {d.rent_lease > 0 && (
                                <div
                                  className="w-full bg-violet-500"
                                  style={{
                                    height: `${(d.rent_lease / (d.total_net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {d.direct_sales > 0 && (
                                <div
                                  className="w-full bg-indigo-500"
                                  style={{
                                    height: `${(d.direct_sales / (d.total_net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {d.sfemi > 0 && (
                                <div
                                  className="w-full bg-emerald-500"
                                  style={{
                                    height: `${(d.sfemi / (d.total_net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {d.total_net === 0 && (
                                <div className="h-full w-full bg-muted/60" />
                              )}
                            </>
                          ) : (
                            <div
                              className={`h-full w-full ${
                                activeStreamFilter === "sfemi"
                                  ? "bg-emerald-500"
                                  : activeStreamFilter === "direct_sales"
                                  ? "bg-indigo-500"
                                  : "bg-violet-500"
                              }`}
                            />
                          )}
                        </div>

                        {/* Axis label for every 5th item or first/last */}
                        {(idx % 5 === 0 || idx === dailyTrends.length - 1) && (
                          <span className="mt-1.5 text-[9px] font-medium text-muted-foreground whitespace-nowrap">
                            {d.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Monthly 6-Month Bar View */
                <div className="flex h-full items-end gap-3 sm:gap-6 px-4">
                  {monthlyTrends.map((m) => {
                    const activeVal =
                      activeStreamFilter === "sfemi"
                        ? m.sfemi
                        : activeStreamFilter === "direct_sales"
                        ? m.direct_sales
                        : activeStreamFilter === "rent_lease"
                        ? m.rent_lease
                        : m.net;
                    const heightPct = Math.max(
                      4,
                      Math.round((activeVal / maxMonthlyValue) * 100)
                    );

                    return (
                      <div
                        key={m.month}
                        onMouseEnter={() => setHoveredDataPoint(m)}
                        onMouseLeave={() => setHoveredDataPoint(null)}
                        className="group relative flex flex-1 flex-col items-center h-full justify-end cursor-pointer"
                      >
                        <div
                          className="w-full max-w-[50px] rounded-t-md transition-all duration-300 group-hover:brightness-110 flex flex-col justify-end overflow-hidden"
                          style={{ height: `${heightPct}%` }}
                        >
                          {activeStreamFilter === "all" ? (
                            <>
                              {m.rent_lease > 0 && (
                                <div
                                  className="w-full bg-violet-500"
                                  style={{
                                    height: `${(m.rent_lease / (m.net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {m.direct_sales > 0 && (
                                <div
                                  className="w-full bg-indigo-500"
                                  style={{
                                    height: `${(m.direct_sales / (m.net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {m.sfemi > 0 && (
                                <div
                                  className="w-full bg-emerald-500"
                                  style={{
                                    height: `${(m.sfemi / (m.net || 1)) * 100}%`,
                                  }}
                                />
                              )}
                              {m.net === 0 && (
                                <div className="h-full w-full bg-muted/60" />
                              )}
                            </>
                          ) : (
                            <div
                              className={`h-full w-full ${
                                activeStreamFilter === "sfemi"
                                  ? "bg-emerald-500"
                                  : activeStreamFilter === "direct_sales"
                                  ? "bg-indigo-500"
                                  : "bg-violet-500"
                              }`}
                            />
                          )}
                        </div>
                        <span className="mt-2 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">
                          {m.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hover Tooltip display */}
            {hoveredDataPoint && (
              <div className="mt-3 rounded-lg border border-border bg-muted/50 p-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-foreground">
                    {"label" in hoveredDataPoint
                      ? hoveredDataPoint.label
                      : hoveredDataPoint.month}
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      SFEMI: <strong>{money(hoveredDataPoint.sfemi)}</strong>
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      Direct Sales: <strong>{money(hoveredDataPoint.direct_sales)}</strong>
                    </span>
                    <span className="text-violet-600 dark:text-violet-400">
                      Rent/Lease: <strong>{money(hoveredDataPoint.rent_lease)}</strong>
                    </span>
                    <span className="font-bold text-foreground">
                      Total Net:{" "}
                      <strong>
                        {money(
                          "total_net" in hoveredDataPoint
                            ? hoveredDataPoint.total_net
                            : hoveredDataPoint.net
                        )}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Revenue Stream Breakdown cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {sales?.streams_breakdown &&
              Object.entries(sales.streams_breakdown).map(([key, stream]) => {
                const colorClass =
                  key === "sfemi"
                    ? "text-emerald-600 bg-emerald-500"
                    : key === "direct_sales"
                    ? "text-indigo-600 bg-indigo-500"
                    : key === "rent"
                    ? "text-violet-600 bg-violet-500"
                    : "text-amber-600 bg-amber-500";

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-border bg-card p-3.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {stream.label}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {stream.pct}%
                      </span>
                    </div>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {money(stream.amount)}
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${colorClass.split(" ")[1]}`}
                        style={{ width: `${Math.min(100, Math.max(3, stream.pct))}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{stream.count} transaction(s)</span>
                      <Link
                        href={
                          key === "sfemi"
                            ? ROUTES.admin.subscriptions
                            : key === "direct_sales"
                            ? ROUTES.admin.billingDirectSales
                            : ROUTES.admin.rentLease
                        }
                        className="font-medium hover:underline text-primary"
                      >
                        Drill in →
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* SECTION 2: INVENTORY & PURCHASING HEALTH (Rendered if tab is 'all' or 'inventory') */}
      {(activeTab === "all" || activeTab === "inventory") && (
        <div className="space-y-4 border-t border-border/80 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Inventory Valuation & Purchasing Pipeline
              </h3>
              <p className="text-xs text-muted-foreground">
                Stock health ratios, stock valuation ({money(inventory?.total_valuation)}), and purchase order commitments.
              </p>
            </div>
            <Link
              href={ROUTES.admin.inventoryStockOnHand}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open stock ledger <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Stock Health Distribution Bar */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-xs font-bold text-foreground">
                Stock Level Distribution ({inventory?.total_skus ?? 0} SKUs)
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {inventory?.total_units_on_hand ?? 0} total physical units across active catalog.
              </p>

              {/* Multi-segment distribution meter */}
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-emerald-500 transition-all"
                  style={{ width: `${inventory?.stock_health?.healthy_pct ?? 0}%` }}
                  title={`Healthy: ${inventory?.stock_health?.healthy_count ?? 0}`}
                />
                <div
                  className="bg-amber-500 transition-all"
                  style={{ width: `${inventory?.stock_health?.low_stock_pct ?? 0}%` }}
                  title={`Low Stock: ${inventory?.stock_health?.low_stock_count ?? 0}`}
                />
                <div
                  className="bg-rose-500 transition-all"
                  style={{ width: `${inventory?.stock_health?.out_of_stock_pct ?? 0}%` }}
                  title={`Out of Stock: ${inventory?.stock_health?.out_of_stock_count ?? 0}`}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                    {inventory?.stock_health?.healthy_count ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-600/80 uppercase">
                    In Stock
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50/60 p-2 dark:bg-amber-950/20">
                  <div className="text-base font-bold text-amber-700 dark:text-amber-400">
                    {inventory?.stock_health?.low_stock_count ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-amber-600/80 uppercase">
                    Low Stock
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50/60 p-2 dark:bg-rose-950/20">
                  <div className="text-base font-bold text-rose-700 dark:text-rose-400">
                    {inventory?.stock_health?.out_of_stock_count ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-rose-600/80 uppercase">
                    Out of Stock
                  </div>
                </div>
              </div>

              {/* Purchasing Flow Indicators */}
              <div className="mt-4 border-t border-border/60 pt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Purchasing Spend & Dues
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border/80 p-2">
                    <span className="text-muted-foreground">Open POs:</span>{" "}
                    <strong className="text-foreground">{inventory?.purchasing?.open_pos_count ?? 0}</strong>
                  </div>
                  <div className="rounded-md border border-border/80 p-2">
                    <span className="text-muted-foreground">Draft GRNs:</span>{" "}
                    <strong className="text-foreground">{inventory?.purchasing?.pending_grn_count ?? 0}</strong>
                  </div>
                  <div className="col-span-2 rounded-md border border-border/80 p-2">
                    <span className="text-muted-foreground">Unpaid Vendor Bills:</span>{" "}
                    <strong className="text-foreground">
                      {money(inventory?.purchasing?.unpaid_bills_amount)} ({inventory?.purchasing?.unpaid_bills_count ?? 0} bills)
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Fast Moving Items Leaderboard */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-foreground">
                  Top Fast-Moving Products (30d)
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  By Outward Movement
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                High velocity items driving showroom & SFEMI deliveries.
              </p>

              <div className="mt-3 space-y-2">
                {inventory?.fast_moving_items?.length ? (
                  inventory.fast_moving_items.map((item, idx) => (
                    <div
                      key={item.product_code + idx}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-semibold text-foreground">
                          {item.product_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.product_code}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400">
                          {item.quantity_out_30d} moved
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          Stock: {item.current_stock}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No outward movement recorded in the last 30 days.
                  </div>
                )}
              </div>
            </div>

            {/* Stock at Risk (Below Reorder Level) */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-foreground">
                  Reorder Alerts & Stock at Risk
                </div>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Items requiring replenishment before fulfillment bottlenecks occur.
              </p>

              <div className="mt-3 space-y-2">
                {inventory?.stock_at_risk?.length ? (
                  inventory.stock_at_risk.map((item) => (
                    <div
                      key={item.item_id}
                      className="flex items-center justify-between rounded-lg border border-amber-200/60 bg-amber-50/40 p-2.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/20"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate font-semibold text-foreground">
                          {item.product_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.product_code} · Reorder: {item.reorder_level}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                            item.status === "OUT_OF_STOCK"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {item.on_hand} on hand
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No items currently below reorder levels. Inventory is balanced.
                  </div>
                )}
              </div>

              <div className="mt-3 text-right">
                <Link
                  href={ROUTES.admin.purchaseOrders}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Create Purchase Order →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: STAFF, MANUFACTURING & PAYROLL (Rendered if tab is 'all' or 'staff') */}
      {(activeTab === "all" || activeTab === "staff") && (
        <div className="space-y-4 border-t border-border/80 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Staff Operations, Manufacturing Labor & Payroll
              </h3>
              <p className="text-xs text-muted-foreground">
                Labor cost efficiency, attendance, department breakdown, and unposted manufacturing labor accruals (Rule 4f).
              </p>
            </div>
            <Link
              href={ROUTES.admin.hrStaff}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Open staff directory <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Attendance & Staff Ratios */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="text-xs font-bold text-foreground">
                Today&apos;s Staff Presence ({staff?.active_staff_count ?? 0} Total Staff)
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Attendance rate: <strong className="text-foreground">{staff?.attendance?.attendance_rate_pct ?? 0}%</strong>
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-emerald-50/60 p-2 dark:bg-emerald-950/20">
                  <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                    {staff?.attendance?.present ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-600 uppercase">
                    Present
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50/60 p-2 dark:bg-amber-950/20">
                  <div className="text-lg font-bold text-amber-700 dark:text-amber-400">
                    {staff?.attendance?.half_day ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-amber-600 uppercase">
                    Half Day
                  </div>
                </div>
                <div className="rounded-lg bg-rose-50/60 p-2 dark:bg-rose-950/20">
                  <div className="text-lg font-bold text-rose-700 dark:text-rose-400">
                    {staff?.attendance?.absent ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-rose-600 uppercase">
                    Absent
                  </div>
                </div>
                <div className="rounded-lg bg-sky-50/60 p-2 dark:bg-sky-950/20">
                  <div className="text-lg font-bold text-sky-700 dark:text-sky-400">
                    {staff?.attendance?.on_leave ?? 0}
                  </div>
                  <div className="text-[10px] font-semibold text-sky-600 uppercase">
                    On Leave
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Monthly Payroll Budget:</span>
                  <span className="font-bold text-foreground">
                    {money(staff?.payroll?.monthly_payroll_cost)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Average Salary / Staff:</span>
                  <span className="font-semibold text-foreground">
                    {money(staff?.payroll?.avg_salary_per_staff)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Outstanding Staff Advances:</span>
                  <span className="font-semibold text-foreground">
                    {money(staff?.advances?.outstanding_amount)} ({staff?.advances?.outstanding_count ?? 0} staff)
                  </span>
                </div>
              </div>
            </div>

            {/* Department Payroll Distribution */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-foreground">
                  Department Staff & Payroll Split
                </div>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Distribution of monthly salary expenditure across functional teams.
              </p>

              <div className="mt-3 space-y-2.5">
                {staff?.departments?.length ? (
                  staff.departments.map((dept) => (
                    <div key={dept.department} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {dept.department} ({dept.staff_count} staff)
                        </span>
                        <span className="font-bold text-foreground">
                          {money(dept.total_salary)} ({dept.pct_of_payroll}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${Math.min(100, Math.max(3, dept.pct_of_payroll))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No department breakdown available yet.
                  </div>
                )}
              </div>
            </div>

            {/* Manufacturing Labor Accruals & WIP (Rule 4f) */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-foreground">
                  Manufacturing Labor & WIP (Rule 4f)
                </div>
                <Factory className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Production job labor tracking bridging into WIP debit and Salary Payable credit.
              </p>

              <div className="mt-3 space-y-2.5">
                <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Unposted Labor Accruals:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {money(staff?.manufacturing?.unposted_labor_accrual_amount)}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {staff?.manufacturing?.unposted_labor_lines_count ?? 0} labor line(s) awaiting posting before job completion.
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-border/80 p-2.5">
                    <span className="text-muted-foreground">Active Production Jobs:</span>
                    <div className="mt-1 text-base font-bold text-foreground">
                      {staff?.manufacturing?.active_production_jobs_count ?? 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/80 p-2.5">
                    <span className="text-muted-foreground">Labor Hours (Month):</span>
                    <div className="mt-1 text-base font-bold text-foreground">
                      {staff?.manufacturing?.total_labor_hours_month ?? 0} hrs
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border/80 p-2 text-xs">
                  <span className="text-muted-foreground">Posted Labor (Month):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {money(staff?.manufacturing?.posted_labor_amount_month)}
                  </span>
                </div>
              </div>

              <div className="mt-3 text-right">
                <Link
                  href={ROUTES.admin.manufacturing}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open Manufacturing Workbench →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
