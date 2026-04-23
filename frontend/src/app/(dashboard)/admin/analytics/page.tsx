"use client";

import { Activity, BarChart3, Building2, FileSearch, ShieldCheck, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ActionButton from "@/components/ui/ActionButton";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
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
      eyebrow="Analytics Control"
      title="Analytics"
      subtitle="Operational intelligence sourced from the live admin dashboard endpoint."
      helperNote="This page only renders live dashboard-backed aggregates and route-safe analysis entry points. Missing payloads are shown as unavailable rather than synthetic zeros."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Analytics" },
      ]}
      actions={[
        { href: ROUTES.admin.reports, label: "Reports Overview", variant: "secondary" },
        { href: ROUTES.admin.analyticsRiskMonitor, label: "Risk Monitor", variant: "secondary" },
        { href: ROUTES.admin.analyticsChurnAnalysis, label: "Churn Analysis", variant: "secondary" },
      ]}
      statusBadge={{ label: "Live Analytics", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Analytics scope"
          description="Use analytics as an overview surface, then move into the dedicated analysis, reporting, and risk routes that own the underlying drill-downs."
          action={
            <ActionButton
              variant="outline"
              onClick={() => void loadPage("refresh")}
              disabled={loading || refreshing}
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </ActionButton>
          }
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Analytics remains a read-only posture view. Operational follow-up stays inside reports,
            branch reporting, finance, and collections workspaces.
          </p>
        </WorkspaceSection>

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
            <WorkspaceDirectory
              title="Analysis route map"
              description="Use overview, risk, and deep-analysis routes to move from aggregate posture into the right operational context."
              groups={[
                {
                  title: "Overview",
                  description: "Entry points for broad operational posture.",
                  items: [
                    {
                      title: "Reports overview",
                      description: "Backend-prepared operational analytics and reporting directory.",
                      href: ROUTES.admin.reports,
                      icon: <BarChart3 className="h-4 w-4" />,
                      badge: "Reports",
                    },
                    {
                      title: "Branch reporting",
                      description: "Collections, sales, and people-cost posture by branch scope.",
                      href: ROUTES.admin.branchReporting,
                      icon: <Building2 className="h-4 w-4" />,
                      badge: "Branch",
                    },
                  ],
                },
                {
                  title: "Risk and follow-up",
                  description: "Operational routes for exception handling and receivable pressure.",
                  items: [
                    {
                      title: "Risk monitor",
                      description: "Dedicated analytics view for risk-focused operational review.",
                      href: ROUTES.admin.analyticsRiskMonitor,
                      icon: <ShieldCheck className="h-4 w-4" />,
                      badge: "Risk",
                    },
                    {
                      title: "Finance control",
                      description: "Receivable and reconciliation posture in the finance domain.",
                      href: ROUTES.admin.finance,
                      icon: <Wallet className="h-4 w-4" />,
                      badge: "Finance",
                    },
                    {
                      title: "Collections workspace",
                      description: "Route from exposure into actual due follow-up and collection execution.",
                      href: ROUTES.admin.collections,
                      icon: <Activity className="h-4 w-4" />,
                      badge: "Action",
                    },
                  ],
                },
                {
                  title: "Deep analysis",
                  description: "Dedicated pages for focused analytical reads rather than dashboard mixing.",
                  items: [
                    {
                      title: "Churn analysis",
                      description: "Focused churn posture without blending into onboarding operations.",
                      href: ROUTES.admin.analyticsChurnAnalysis,
                      icon: <FileSearch className="h-4 w-4" />,
                      badge: "Trend",
                    },
                    {
                      title: "Customer analytics report",
                      description: "Report-grade customer portfolio and behavior analysis.",
                      href: ROUTES.admin.reportsCustomerAnalytics,
                      icon: <FileSearch className="h-4 w-4" />,
                      badge: "Customer",
                    },
                  ],
                },
              ]}
            />
            <WorkspaceSection
              title="Live analytics posture"
              description="Current dashboard-backed aggregates. Missing values stay visible as unavailable so operators do not confuse absent data with zero."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <StatCard
                  label="Active Subscriptions"
                  value={metricValue(snapshot.subscriptions?.active)}
                  tone="info"
                />
                <StatCard
                  label="Completed Subscriptions"
                  value={metricValue(snapshot.subscriptions?.completed)}
                />
                <StatCard
                  label="Won Subscriptions"
                  value={metricValue(snapshot.subscriptions?.won)}
                  tone="success"
                />
                <StatCard
                  label="Pending EMI"
                  value={metricValue(snapshot.emi?.pending)}
                />
                <StatCard
                  label="Overdue EMI"
                  value={metricValue(snapshot.emi?.overdue)}
                  tone={
                    Number(snapshot.emi?.overdue ?? 0) > 0 ? "warning" : "success"
                  }
                />
                <StatCard
                  label="Total Outstanding"
                  value={moneyValue(snapshot.financial?.total_outstanding)}
                  tone="warning"
                />
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
