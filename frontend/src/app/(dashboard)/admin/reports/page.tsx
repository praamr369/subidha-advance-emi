"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, RefreshCw, TrendingUp } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import StatusBadge from "@/components/ui/status-badge";
import { WorkspaceSection } from "@/components/ui/workspace";
import { getAdminDashboardSnapshot, getReconciliationSnapshot } from "@/services/reports";

function money(value: string | number | undefined): string {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Failed to load reports overview.";
}

type DashboardSnapshot = Awaited<ReturnType<typeof getAdminDashboardSnapshot>>;
type ReconciliationSnapshot = Awaited<ReturnType<typeof getReconciliationSnapshot>>;

export default function AdminReportsPage() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [recon, setRecon] = useState<ReconciliationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPage(mode: "initial" | "refresh" = "initial") {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const [dashboardPayload, reconciliationPayload] = await Promise.all([
        getAdminDashboardSnapshot(),
        getReconciliationSnapshot(),
      ]);

      setDashboard(dashboardPayload);
      setRecon(reconciliationPayload);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setDashboard(null);
      setRecon(null);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadPage("initial");
  }, []);

  const cards = useMemo(
    () => [
      {
        label: "Today Collection",
        value: money(dashboard?.financial?.today_collection),
        subtext: "Same-day collection visibility",
        tone: "success" as const,
      },
      {
        label: "Outstanding",
        value: money(dashboard?.financial?.total_outstanding),
        subtext: "Current receivable exposure",
        tone: "warning" as const,
      },
      {
        label: "Pending EMIs",
        value: String(dashboard?.emi?.pending ?? 0),
        subtext: "Open obligations across the book",
      },
      {
        label: "Overdue EMIs",
        value: String(dashboard?.emi?.overdue ?? 0),
        subtext: "Immediate follow-up workload",
        tone: (dashboard?.emi?.overdue ?? 0) > 0 ? ("danger" as const) : undefined,
      },
      {
        label: "Active Subscriptions",
        value: String(dashboard?.subscriptions?.active ?? 0),
        subtext: "Currently live contracts",
      },
      {
        label: "Flagged Reconciliation",
        value: String(recon?.flaggedCount ?? recon?.flagged_count ?? 0),
        subtext: "Records needing finance review",
        tone:
          (recon?.flaggedCount ?? recon?.flagged_count ?? 0) > 0
            ? ("warning" as const)
            : undefined,
      },
    ],
    [dashboard, recon]
  );

  const quickLinks = [
    {
      title: "Revenue Report",
      description: "Review collections, method mix, and payment drill-down.",
      href: "/admin/reports/revenue",
      badge: "PAID",
    },
    {
      title: "Overdue EMI Report",
      description: "Track pending and overdue EMI exposure with list drill-down.",
      href: "/admin/reports/overdue",
      badge: "OVERDUE",
    },
    {
      title: "Batch Performance",
      description: "Inspect subscription and winner progression by batch.",
      href: "/admin/reports/batch-performance",
      badge: "OPEN",
    },
    {
      title: "Customer Analytics",
      description: "Review customer concentration, engagement, and trend slices.",
      href: "/admin/reports/customer-analytics",
      badge: "ACTIVE",
    },
    {
      title: "Collections Snapshot",
      description: "Open the collections view for operational settlement review.",
      href: "/admin/reports/collections",
      badge: "VERIFIED",
    },
    {
      title: "Reconciliation Workspace",
      description: "Route into flagged subscription financial mismatches.",
      href: "/admin/reconciliation",
      badge: "UNDER_REVIEW",
    },
  ];

  const reconRows = recon?.results || [];

  return (
    <PortalPage
      title="Reports Overview"
      subtitle="Daily operational reporting for collections, overdue exposure, batch performance, and reconciliation health without changing any underlying finance rules."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Reports" },
      ]}
      actions={[
        { href: "/admin/reconciliation", label: "Open Reconciliation", variant: "secondary" },
        { href: "/admin/reports/revenue", label: "Open Revenue", variant: "primary" },
      ]}
      stats={[
        { label: "Today Collection", value: money(dashboard?.financial?.today_collection), tone: "success" },
        { label: "Overdue EMIs", value: String(dashboard?.emi?.overdue ?? 0), tone: "warning" },
        {
          label: "Flagged Reconciliation",
          value: String(recon?.flaggedCount ?? recon?.flagged_count ?? 0),
          tone:
            (recon?.flaggedCount ?? recon?.flagged_count ?? 0) > 0 ? "warning" : undefined,
        },
        { label: "Reports", value: quickLinks.length },
      ]}
      statusBadge={{ label: "Operational Reporting", tone: "info" }}
    >
      <div className="space-y-6">
        <WorkspaceSection
          title="Reporting workflow"
          description="Use this page as the entry point for daily reporting, export, and finance follow-up."
          action={
            <button
              type="button"
              onClick={() => void loadPage("refresh")}
              disabled={refreshing || loading}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4" />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
          }
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                subtext={card.subtext}
                tone={card.tone}
                icon={
                  card.label === "Flagged Reconciliation" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )
                }
              />
            ))}
          </div>
        </WorkspaceSection>

        {loading ? <LoadingBlock label="Loading reports overview..." /> : null}

        {!loading && error ? (
          <ErrorState
            title="Unable to load reports overview"
            description={error}
            onRetry={() => void loadPage("initial")}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <WorkspaceSection
              title="Report shortcuts"
              description="Open the focused report you need without drilling through older menu layers."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quickLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <StatusBadge status={item.badge} />
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground">
                      Open report
                      <Download className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </WorkspaceSection>

            <WorkspaceSection
              title="Reconciliation visibility"
              description={
                recon?.guidance ||
                "Use reconciliation reports to verify portfolio consistency before operational close."
              }
              action={
                reconRows.length > 0 ? (
                  <Link
                    href="/admin/reconciliation"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted"
                  >
                    Open Full Queue
                  </Link>
                ) : undefined
              }
            >
              {reconRows.length === 0 ? (
                <EmptyState
                  title="No reconciliation flags"
                  description="No flagged reconciliation records are currently visible."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/40">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Subscription</th>
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium">Delta</th>
                        <th className="px-4 py-3 font-medium">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-sm">
                      {reconRows.slice(0, 6).map((row) => (
                        <tr key={row.id}>
                          <td className="px-4 py-3 font-medium text-foreground">
                            {row.subscription_number}
                          </td>
                          <td className="px-4 py-3">{row.customer_name}</td>
                          <td className="px-4 py-3">
                            ₹{Number(row.delta || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={Number(row.delta || 0) === 0 ? "VERIFIED" : "UNDER_REVIEW"}
                              label={Number(row.delta || 0) === 0 ? "Balanced" : "Flagged"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
