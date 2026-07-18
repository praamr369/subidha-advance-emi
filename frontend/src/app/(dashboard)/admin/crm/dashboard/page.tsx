"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { apiFetch } from "@/lib/api";

interface WorkflowStats {
  stage: string;
  count: number;
  revenue?: number;
  conversionRate?: number;
  avgValue?: number;
}

interface DashboardData {
  leads: WorkflowStats;
  onlineRequests: WorkflowStats;
  productRequests: WorkflowStats;
  subscriptionRequests: WorkflowStats;
  subscriptions: WorkflowStats;
  directSales: WorkflowStats;
  roi: {
    totalLeads: number;
    totalConversions: number;
    conversionRate: number;
    totalRevenue: number;
    avgRevenuePerLead: number;
    roi: number;
  };
}

function StageCard({
  stage,
  count,
  revenue,
  conversionRate,
  avgValue,
  link,
}: WorkflowStats & { link?: string }) {
  const content = (
    <div className="rounded-lg border border-border bg-card p-4 hover:bg-muted/20 transition">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="font-semibold text-foreground">{stage}</div>
        <div className="text-2xl font-bold text-primary">{count}</div>
      </div>

      {revenue && (
        <div className="text-sm text-muted-foreground">
          Revenue: <span className="font-semibold text-foreground">{formatRupee(revenue)}</span>
        </div>
      )}

      {conversionRate !== undefined && (
        <div className="text-sm text-muted-foreground">
          Conversion: <span className="font-semibold text-emerald-600">{conversionRate.toFixed(1)}%</span>
        </div>
      )}

      {avgValue && (
        <div className="text-sm text-muted-foreground">
          Avg Value: <span className="font-semibold text-foreground">{formatRupee(avgValue)}</span>
        </div>
      )}
    </div>
  );

  return link ? <Link href={link}>{content}</Link> : content;
}

function ConversionFlow({
  leads,
  requests,
  products,
  subscriptions,
  sales,
}: {
  leads: number;
  requests: number;
  products: number;
  subscriptions: number;
  sales: number;
}) {
  const calcPct = (num: number, denom: number) =>
    denom > 0 ? ((num / denom) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
        <span className="font-medium text-foreground">Leads Created</span>
        <div className="text-right">
          <div className="text-2xl font-bold text-primary">{leads}</div>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">↓</div>

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
        <span className="font-medium text-foreground">Online Requests</span>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">{requests}</div>
          <div className="text-xs text-muted-foreground">{calcPct(requests, leads)}% of leads</div>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">↓</div>

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
        <span className="font-medium text-foreground">Product/Sub Requests</span>
        <div className="text-right">
          <div className="text-2xl font-bold text-violet-600">{products}</div>
          <div className="text-xs text-muted-foreground">{calcPct(products, requests)}% of requests</div>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">↓</div>

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
        <span className="font-medium text-foreground">Active Subscriptions</span>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-600">{subscriptions}</div>
          <div className="text-xs text-muted-foreground">{calcPct(subscriptions, products)}% converted</div>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">+</div>

      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
        <span className="font-medium text-foreground">Direct Sales</span>
        <div className="text-right">
          <div className="text-2xl font-bold text-orange-600">{sales}</div>
        </div>
      </div>
    </div>
  );
}

export default function UnifiedCRMDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data: DashboardData = await apiFetch("/api/v1/admin/crm/analytics/dashboard/");
      setData(data);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Unified CRM Dashboard"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: ROUTES.admin.crmWorkspace },
          { label: "Unified Dashboard" },
        ]}
      >
        <div className="text-center py-8">Loading dashboard...</div>
      </ERPPageShell>
    );
  }

  if (!data) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Unified CRM Dashboard"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: ROUTES.admin.crmWorkspace },
          { label: "Unified Dashboard" },
        ]}
      >
        <div className="text-center py-8 text-destructive">Error loading dashboard</div>
      </ERPPageShell>
    );
  }

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Unified CRM Dashboard"
      subtitle="Complete workflow: Leads → Online Requests → Product/Subscription Requests → Sales"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crmWorkspace },
        { label: "Unified Dashboard" },
      ]}
      actions={[
        { href: ROUTES.admin.crmLeads, label: "View Leads", variant: "secondary" },
        { href: "/admin/crm/analytics", label: "Analytics", variant: "secondary" },
      ]}
      statusBadge={{ label: "Real-time tracking", tone: "success" as const }}
    >
      <div className="space-y-8">
        {/* Conversion Flow */}
        <ERPSectionShell title="Conversion Flow" description="Lead-to-sale journey at a glance">
          <ConversionFlow
            leads={data.leads.count}
            requests={data.onlineRequests.count}
            products={data.productRequests.count}
            subscriptions={data.subscriptions.count}
            sales={data.directSales.count}
          />
        </ERPSectionShell>

        {/* ROI Summary */}
        <ERPSectionShell title="ROI Summary" description="Business metrics and performance">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Lead → Sale Conversion
              </div>
              <div className="text-3xl font-bold text-primary mt-2">
                {data.roi.conversionRate.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.roi.totalConversions} of {data.roi.totalLeads} leads
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Total Revenue
              </div>
              <div className="text-3xl font-bold text-emerald-600 mt-2">
                {formatRupee(data.roi.totalRevenue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                From {data.roi.totalConversions} sales
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Avg Revenue/Lead
              </div>
              <div className="text-3xl font-bold text-blue-600 mt-2">
                {formatRupee(data.roi.avgRevenuePerLead)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Per converted lead
              </div>
            </div>
          </div>
        </ERPSectionShell>

        {/* Stage Details */}
        <ERPSectionShell
          title="All Stages"
          description="Click any stage to view detailed records"
        >
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StageCard
              stage="CRM Leads"
              count={data.leads.count}
              link={ROUTES.admin.crmLeads}
            />
            <StageCard
              stage="Online Requests"
              count={data.onlineRequests.count}
              link={ROUTES.admin.requestsOnlineRequests}
            />
            <StageCard
              stage="Product Requests"
              count={data.productRequests.count}
              link={ROUTES.admin.subscriptionRequests}
            />
            <StageCard
              stage="Subscription Requests"
              count={data.subscriptionRequests.count}
              link={ROUTES.admin.requestsSubscriptions}
            />
            <StageCard
              stage="Active Subscriptions"
              count={data.subscriptions.count}
              link={ROUTES.admin.subscriptions}
            />
            <StageCard
              stage="Direct Sales"
              count={data.directSales.count}
              link={ROUTES.admin.billingDirectSaleWorkspace}
            />
          </div>
        </ERPSectionShell>

        {/* Quick Links */}
        <ERPSectionShell title="Quick Navigation" description="Jump to any workflow stage">
          <div className="grid gap-3 md:grid-cols-2">
            <Link
              href={ROUTES.admin.crmWorkspace}
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">CRM Workspace</div>
              <div className="text-sm text-muted-foreground">Leads, pipeline, follow-ups</div>
            </Link>
            <Link
              href="/admin/crm/analytics"
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">Analytics Dashboard</div>
              <div className="text-sm text-muted-foreground">Funnel, trends, performance</div>
            </Link>
            <Link
              href={ROUTES.admin.requestsOnlineRequests}
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">Quote Management</div>
              <div className="text-sm text-muted-foreground">Online requests → Approval</div>
            </Link>
            <Link
              href={ROUTES.admin.requestsSubscriptions}
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">Approval Queues</div>
              <div className="text-sm text-muted-foreground">Product & subscription requests</div>
            </Link>
            <Link
              href={ROUTES.admin.subscriptions}
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">Active Subscriptions</div>
              <div className="text-sm text-muted-foreground">EMI, Rent, Lease contracts</div>
            </Link>
            <Link
              href={ROUTES.admin.billingDirectSaleWorkspace}
              className="p-3 border border-border rounded-lg hover:bg-muted/20 transition"
            >
              <div className="font-semibold text-foreground">Direct Sales</div>
              <div className="text-sm text-muted-foreground">One-time sales transactions</div>
            </Link>
          </div>
        </ERPSectionShell>

        {/* Info Box */}
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800/40 dark:bg-blue-900/20 p-4 text-sm text-blue-800 dark:text-blue-300">
          <strong>Complete Workflow:</strong> Leads are sourced via forms or partnerships → create Online Requests with quotes → customers convert to Product/Subscription Requests → approved requests auto-create Subscriptions or Direct Sales → revenue tracked end-to-end.
        </div>
      </div>
    </ERPPageShell>
  );
}
