"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { ROUTES } from "@/lib/routes";
import { getAdminAnalyticsSummary, type AdminAnalyticsSummaryResponse } from "@/services/reports";
import { formatRupee } from "@/lib/utils/currency";

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Failed to load collections analytics.";
}

function MiniBar({ label, value, total, amount }: { label: string; value: number; total: number; amount?: string }) {
  const width = percent(value, total);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground">{label}</span>
        <span className="text-muted-foreground">{amount ?? String(value)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-sky-600 transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function CollectionsReportPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    try {
      const payload = await getAdminAnalyticsSummary({ window: "THIS_MONTH" });
      setAnalytics(payload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setAnalytics(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadPage("initial"); }, [loadPage]);

  const trendPoints = useMemo(() => analytics?.collections_trend.points ?? [], [analytics]);
  const recentTrend = useMemo(() => trendPoints.slice(-10), [trendPoints]);
  const trendMax = useMemo(() => recentTrend.reduce((max, p) => Math.max(max, toNumber(p.net_amount)), 0), [recentTrend]);

  const methodRows = useMemo(() => analytics?.payment_method_mix.rows ?? [], [analytics]);
  const methodTotal = useMemo(() => methodRows.reduce((sum, r) => sum + toNumber(r.net_amount), 0), [methodRows]);

  const overview = analytics?.overview;

  return (
    <PortalPage
      title="Collections Report"
      subtitle="Source-linked collection analytics for the current month — trend, payment method mix, and overdue exposure posture."
      headerMode="erp"
      helperNote="Read-only BI. Decision support only — no posting from this page. To act on collections or outstandings, use Finance Operations / Outstandings or Collections & Cashier."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Reports", href: ROUTES.admin.reports },
        { label: "Collections" },
      ]}
      actions={[
        { href: ROUTES.admin.reports, label: "Back to Reports", variant: "secondary" },
        { href: ROUTES.admin.financeOutstandings, label: "Open Outstandings", variant: "secondary" },
        { href: ROUTES.admin.collections, label: "Collections Workspace", variant: "primary" },
      ]}
      stats={[
        { label: "Net Collected", value: formatRupee(overview?.window_net_collections), tone: "success" },
        { label: "Active Payments", value: String(overview?.window_active_collection_count ?? 0) },
        { label: "Overdue EMIs", value: String(overview?.overdue_emi_count ?? 0), tone: (overview?.overdue_emi_count ?? 0) > 0 ? "warning" : "default" },
        { label: "Overdue Amount", value: formatRupee(overview?.overdue_emi_amount), tone: (overview?.overdue_emi_count ?? 0) > 0 ? "warning" : "default" },
      ]}
      statusBadge={{ label: "Source-linked report", tone: "info" }}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Collection analytics are sourced from the admin analytics summary. Payment posting and collection execution remain in their owned operational workflows.
          </p>
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading collections analytics..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load collections report"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && analytics ? (
          <>
            <WorkspaceSection
              title="Collection trend (this month)"
              description="Daily net collections for the current month window from backend analytics. Source: admin analytics summary endpoint."
              note="These totals reflect backend-prepared aggregates. Individual payment records are in Collections & Cashier."
              noteTone="info"
            >
              {recentTrend.length === 0 ? (
                <EmptyState
                  title="No collection trend rows"
                  description="No payment records are visible for the current month window."
                />
              ) : (
                <div className="space-y-4">
                  {recentTrend.map((point) => (
                    <MiniBar
                      key={`${point.date ?? "na"}-${point.count}`}
                      label={point.date ?? "Unknown date"}
                      value={toNumber(point.net_amount)}
                      total={Math.max(trendMax, 1)}
                      amount={`${formatRupee(point.net_amount)} · ${point.active_count} active`}
                    />
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <WorkspaceSection
              title="Payment method mix"
              description="Method-wise net collections for the current window. Reversed rows retained in backend totals."
            >
              {methodRows.length === 0 ? (
                <EmptyState
                  title="No method split data"
                  description="No payment method mix available for the current window."
                />
              ) : (
                <div className="space-y-4">
                  {methodRows.map((row) => (
                    <MiniBar
                      key={row.method}
                      label={row.method}
                      value={toNumber(row.net_amount)}
                      total={Math.max(methodTotal, 1)}
                      amount={`${formatRupee(row.net_amount)} · ${row.active_count} active`}
                    />
                  ))}
                </div>
              )}
            </WorkspaceSection>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <StatCard
                label="Reconciliation Flags"
                value={String(overview?.reconciliation_flagged_count ?? 0)}
                subtext="Subscription-level mismatch signals"
                tone={(overview?.reconciliation_flagged_count ?? 0) > 0 ? "warning" : undefined}
                href={ROUTES.admin.financeCanonicalReconciliation}
              />
              <StatCard
                label="Delivery Actions"
                value={String(overview?.delivery_action_count ?? 0)}
                subtext="Pending + scheduled + in-transit"
                href={ROUTES.admin.deliveries}
              />
              <StatCard
                label="Pending Commission"
                value={formatRupee(overview?.pending_commission_amount)}
                subtext={`${overview?.pending_commission_count ?? 0} rows`}
                tone={(overview?.pending_commission_count ?? 0) > 0 ? "warning" : undefined}
                href={ROUTES.admin.financeCommissions}
              />
            </div>

            <WorkspaceSection
              title="Drill down to source workflows"
              description="This report is decision support only. Use these links to take operational action."
            >
              <div className="flex flex-wrap gap-3">
                <Link
                  href={ROUTES.admin.financeOutstandings}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Finance Operations — Outstandings
                </Link>
                <Link
                  href={ROUTES.admin.collections}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Collections & Cashier
                </Link>
                <Link
                  href={ROUTES.admin.reportsOverdue}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Overdue EMI Report
                </Link>
                <Link
                  href={ROUTES.admin.financeCanonicalReconciliation}
                  className="inline-flex items-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
                >
                  Accounting Reconciliation
                </Link>
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
