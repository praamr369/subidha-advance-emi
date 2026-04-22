"use client";

import { Activity, BarChart3, Building2, FileSearch, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";

type AdminAnalyticsSnapshot = {
  financial?: {
    total_revenue?: string | number;
    today_collection?: string | number;
    total_outstanding?: string | number;
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
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Failed to load analytics dashboard truth.";
}

function metricValue(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "Unavailable" : String(value);
}

function moneyValue(value: string | number | null | undefined): string {
  return value === null || value === undefined
    ? "Unavailable"
    : `₹${Number(value).toFixed(2)}`;
}

export default function AnalyticsPage() {
  const [snapshot, setSnapshot] = useState<AdminAnalyticsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const payload = await apiFetch<AdminAnalyticsSnapshot>("/admin/dashboard/");
      setSnapshot(payload);
      setError(null);
    } catch (err) {
      setSnapshot(null);
      setError(toErrorMessage(err));
    } finally {
      if (mode === "initial") {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadPage("initial");
  }, [loadPage]);

  return (
    <PortalPage
      title="Analytics"
      subtitle="Operational intelligence sourced from the live admin dashboard endpoint."
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void loadPage("refresh")}
            disabled={loading || refreshing}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {loading ? <LoadingBlock label="Loading analytics dashboard..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load analytics"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error && !snapshot ? (
          <EmptyState
            title="Analytics unavailable"
            description="No admin dashboard payload was returned for analytics."
          />
        ) : null}

        {!loading && !error && snapshot ? (
          <>
            <ControlLaneGrid
              title="Analysis lanes"
              description="Use route-safe analytics workspaces to move from aggregate posture into the operational modules that own the underlying records."
              lanes={[
                {
                  title: "Operations cockpit",
                  description: "Daily queues, overdue posture, and cross-module workload signals.",
                  href: ROUTES.admin.operations,
                  icon: <Activity className="h-4 w-4" />,
                  badge: "Ops",
                },
                {
                  title: "Branch reporting",
                  description: "Branch-wise collections, sales, people-cost, and stock posture from live registers.",
                  href: ROUTES.admin.branchReporting,
                  icon: <Building2 className="h-4 w-4" />,
                  badge: "Branch",
                },
                {
                  title: "Reports workspace",
                  description: "Windowed trends, reconciliation pressure, and report drill-downs.",
                  href: ROUTES.admin.reports,
                  icon: <BarChart3 className="h-4 w-4" />,
                  badge: "Reports",
                },
                {
                  title: "Finance control",
                  description: "Receivables, reconciliation, and cash or bank posture stay in a separate finance lane.",
                  href: ROUTES.admin.finance,
                  icon: <Wallet className="h-4 w-4" />,
                  badge: "Finance",
                },
                {
                  title: "Audit visibility",
                  description: "Review admin actions and controls without fabricating synthetic metrics.",
                  href: ROUTES.admin.auditLogs,
                  icon: <ShieldCheck className="h-4 w-4" />,
                  badge: "Audit",
                },
                {
                  title: "Detailed reports",
                  description: "Move from headline analytics into explicit report surfaces and exports.",
                  href: ROUTES.admin.reports,
                  icon: <FileSearch className="h-4 w-4" />,
                  badge: "Detail",
                },
              ]}
            />
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Subscriptions
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(snapshot.subscriptions?.active)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Completed Subscriptions
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(snapshot.subscriptions?.completed)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Won Subscriptions
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(snapshot.subscriptions?.won)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Pending EMI
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(snapshot.emi?.pending)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Overdue EMI
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {metricValue(snapshot.emi?.overdue)}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total Outstanding
                </div>
                <div className="mt-2 text-xl font-semibold text-foreground">
                  {moneyValue(snapshot.financial?.total_outstanding)}
                </div>
              </div>
            </section>

            <p className="text-sm text-muted-foreground">
              This page intentionally shows only live dashboard-backed aggregates. Missing data is rendered as unavailable rather than synthetic zero.
            </p>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
