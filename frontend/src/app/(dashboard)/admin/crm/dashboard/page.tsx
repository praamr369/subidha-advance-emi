"use client";

import { useCallback, useEffect, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { getCrmAnalyticsDashboard } from "@/services/crm";

interface DashboardMetrics {
  leads: { stage: string; count: number };
  onlineRequests: { stage: string; count: number };
  productRequests: { stage: string; count: number };
  subscriptionRequests: { stage: string; count: number };
  subscriptions: { stage: string; count: number; revenue: number };
  directSales: { stage: string; count: number; revenue: number };
  roi: {
    totalLeads: number;
    totalConversions: number;
    conversionRate: number;
    totalRevenue: number;
    avgRevenuePerLead: number;
  };
}

export default function CrmDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCrmAnalyticsDashboard();
      setMetrics(data);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load dashboard metrics";
      setError(errorMessage);
      console.error("Dashboard metrics error:", err);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Analytics Dashboard"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: ROUTES.admin.crmWorkspace },
          { label: "Dashboard" },
        ]}
      >
        <div className="text-center py-8 text-muted-foreground">Loading dashboard metrics...</div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Analytics Dashboard"
      subtitle="Complete workflow analytics: Leads → Requests → Subscriptions → Sales with ROI tracking."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crmWorkspace },
        { label: "Dashboard" },
      ]}
      actions={[
        { href: ROUTES.admin.crmWorkspace, label: "Workspace", variant: "secondary" },
        { href: ROUTES.admin.crmLeads, label: "Leads", variant: "primary" },
      ]}
      statusBadge={{ label: "Real-time metrics", tone: "success" }}
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {metrics ? (
        <>
          {/* Conversion Flow */}
          <ERPSectionShell
            title="Conversion Flow"
            description="Lead-to-sale journey at a glance"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <span className="font-medium text-foreground">Leads Created</span>
                <div className="text-2xl font-bold text-primary">{metrics.leads?.count ?? 0}</div>
              </div>

              <div className="text-center text-xs text-muted-foreground">↓</div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <span className="font-medium text-foreground">Online Requests</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">{metrics.onlineRequests?.count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {(metrics.leads?.count ?? 0) > 0
                      ? (((metrics.onlineRequests?.count ?? 0) / (metrics.leads?.count ?? 1) * 100).toFixed(1))
                      : "0"}% of leads
                  </div>
                </div>
              </div>

              <div className="text-center text-xs text-muted-foreground">↓</div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <span className="font-medium text-foreground">Product/Sub Requests</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-violet-600">
                    {(metrics.productRequests?.count ?? 0) + (metrics.subscriptionRequests?.count ?? 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {(metrics.onlineRequests?.count ?? 0) > 0
                      ? ((((metrics.productRequests?.count ?? 0) + (metrics.subscriptionRequests?.count ?? 0)) / (metrics.onlineRequests?.count ?? 1) * 100).toFixed(1))
                      : "0"}% of requests
                  </div>
                </div>
              </div>

              <div className="text-center text-xs text-muted-foreground">↓</div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <span className="font-medium text-foreground">Active Subscriptions</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-emerald-600">{metrics.subscriptions?.count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {(metrics.roi?.conversionRate ?? 0).toFixed(1)}% overall conversion
                  </div>
                </div>
              </div>

              <div className="text-center text-xs text-muted-foreground">+</div>

              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <span className="font-medium text-foreground">Direct Sales</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-orange-600">{metrics.directSales?.count ?? 0}</div>
                </div>
              </div>
            </div>
          </ERPSectionShell>

          {/* ROI Summary */}
          <ERPSectionShell
            title="ROI Summary"
            description="Business metrics and performance indicators"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Lead → Sale Conversion
                </div>
                <div className="text-3xl font-bold text-primary mt-2">
                  {((metrics.roi?.conversionRate) ?? 0).toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metrics.roi?.totalConversions ?? 0} of {metrics.roi?.totalLeads ?? 0} leads
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Total Revenue
                </div>
                <div className="text-3xl font-bold text-emerald-600 mt-2">
                  {formatRupee(metrics.roi?.totalRevenue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  From {metrics.roi?.totalConversions ?? 0} sales
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Avg Revenue/Lead
                </div>
                <div className="text-3xl font-bold text-blue-600 mt-2">
                  {formatRupee(metrics.roi?.avgRevenuePerLead ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Per converted lead
                </div>
              </div>
            </div>
          </ERPSectionShell>

          {/* Revenue Breakdown */}
          <ERPSectionShell
            title="Revenue Breakdown"
            description="Revenue sources from subscriptions and direct sales"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Subscription Revenue
                </div>
                <div className="text-2xl font-bold text-emerald-600 mt-2">
                  {formatRupee(metrics.subscriptions?.revenue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metrics.subscriptions?.count ?? 0} active subscriptions
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Direct Sales Revenue
                </div>
                <div className="text-2xl font-bold text-orange-600 mt-2">
                  {formatRupee(metrics.directSales?.revenue ?? 0)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metrics.directSales?.count ?? 0} direct sales
                </div>
              </div>
            </div>
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
