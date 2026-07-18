"use client";

import { useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { apiFetch } from "@/lib/api";

interface PipelineAnalytics {
  period_days: number;
  summary: {
    total_leads: number;
    approved_count: number;
    converted_count: number;
    total_revenue: number;
    avg_revenue_per_lead: number;
    conversion_rate: number;
    approval_rate: number;
  };
  by_stage: Record<string, { count: number; revenue: number }>;
  by_type: Record<string, { count: number; revenue: number }>;
}

export default function PipelineAnalyticsPage() {
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setLoading(true);
        const data = await apiFetch(`/api/v1/crm-pipeline/pipeline/analytics/?days=${days}`);
        setAnalytics(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load analytics");
        setAnalytics(null);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [days]);

  if (loading) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Pipeline Analytics"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: ROUTES.admin.crmWorkspace },
          { label: "Analytics" },
        ]}
      >
        <div className="text-center py-12">Loading analytics...</div>
      </ERPPageShell>
    );
  }

  if (error || !analytics) {
    return (
      <ERPPageShell
        eyebrow="CRM"
        title="Pipeline Analytics"
        breadcrumbs={[
          { label: "Admin", href: ROUTES.admin.dashboard },
          { label: "CRM", href: ROUTES.admin.crmWorkspace },
          { label: "Analytics" },
        ]}
      >
        <div className="p-4 bg-red-100 dark:bg-red-900 border border-red-300 rounded-lg">
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      </ERPPageShell>
    );
  }

  const stages = ['LEAD', 'ENQUIRY', 'QUOTED', 'APPROVED', 'CONVERTED'];
  const types = ['DIRECT_SALE', 'SUBSCRIPTION', 'RENT', 'LEASE'];

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Pipeline Analytics"
      subtitle="Comprehensive pipeline health metrics, conversion rates, and revenue tracking"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crmWorkspace },
        { label: "Analytics" },
      ]}
      actions={[
        { href: ROUTES.admin.crmPipeline, label: "Pipeline Board", variant: "secondary" },
        { href: ROUTES.admin.crmWorkspace, label: "Workspace", variant: "secondary" },
      ]}
      statusBadge={{ label: `Last ${days} days`, tone: "info" as const }}
      stats={[
        {
          label: "Total Leads",
          value: analytics.summary.total_leads,
          tone: "default" as const,
        },
        {
          label: "Approved",
          value: analytics.summary.approved_count,
          tone: "success" as const,
        },
        {
          label: "Converted",
          value: analytics.summary.converted_count,
          tone: "default" as const,
        },
        {
          label: "Total Revenue",
          value: formatRupee(analytics.summary.total_revenue),
          tone: "success" as const,
        },
      ]}
    >
      {/* Date Range Selector */}
      <div className="mb-6 flex gap-2">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-2 rounded-lg transition font-medium ${
              days === d
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {/* Summary Metrics */}
      <ERPSectionShell
        title="Pipeline Health"
        description="Overall conversion and approval metrics"
      >
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Approval Rate</div>
            <div className="text-3xl font-bold text-primary mt-2">
              {analytics.summary.approval_rate}%
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {analytics.summary.approved_count} of {analytics.summary.total_leads}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Conversion Rate</div>
            <div className="text-3xl font-bold text-green-600 mt-2">
              {analytics.summary.conversion_rate}%
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {analytics.summary.converted_count} conversions
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Avg Revenue/Lead</div>
            <div className="text-3xl font-bold text-blue-600 mt-2">
              {formatRupee(analytics.summary.avg_revenue_per_lead)}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-medium text-muted-foreground uppercase">Total Revenue</div>
            <div className="text-3xl font-bold text-emerald-600 mt-2">
              {formatRupee(analytics.summary.total_revenue)}
            </div>
          </div>
        </div>
      </ERPSectionShell>

      {/* Stage Breakdown */}
      <ERPSectionShell
        title="Pipeline by Stage"
        description="Lead distribution and revenue across pipeline stages"
      >
        <div className="space-y-3">
          {stages.map(stage => {
            const data = analytics.by_stage[stage];
            const total = analytics.summary.total_leads;
            const percentage = total > 0 ? (data.count / total * 100) : 0;

            return (
              <div key={stage} className="p-4 border border-border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{stage}</div>
                  <div className="text-sm text-muted-foreground">{data.count} leads</div>
                </div>

                <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                <div className="flex justify-between mt-2 text-sm text-muted-foreground">
                  <span>{percentage.toFixed(1)}% of pipeline</span>
                  <span>{formatRupee(data.revenue)} revenue</span>
                </div>
              </div>
            );
          })}
        </div>
      </ERPSectionShell>

      {/* Type Breakdown */}
      <ERPSectionShell
        title="Pipeline by Contract Type"
        description="Leads and revenue by approval/contract type"
      >
        <div className="grid gap-4 md:grid-cols-4">
          {types.map(type => {
            const data = analytics.by_type[type];
            const typeLabel = {
              'DIRECT_SALE': 'Direct Sale',
              'SUBSCRIPTION': 'EMI/Subscription',
              'RENT': 'Rent',
              'LEASE': 'Lease',
            }[type] || type;

            return (
              <div key={type} className="rounded-lg border border-border bg-card p-4">
                <div className="text-sm font-medium text-muted-foreground">{typeLabel}</div>
                <div className="text-2xl font-bold text-primary mt-2">{data.count}</div>
                <div className="text-xs text-muted-foreground mt-1">leads</div>
                <div className="text-lg font-semibold text-green-600 mt-3">
                  {formatRupee(data.revenue)}
                </div>
                <div className="text-xs text-muted-foreground">revenue</div>
              </div>
            );
          })}
        </div>
      </ERPSectionShell>

      {/* Funnel Visualization */}
      <ERPSectionShell
        title="Conversion Funnel"
        description="Visual representation of lead progression through pipeline"
      >
        <div className="space-y-4">
          {stages.map((stage, index) => {
            const data = analytics.by_stage[stage];
            const nextData = index < stages.length - 1 ? analytics.by_stage[stages[index + 1]] : null;
            const conversionRate = nextData && data.count > 0
              ? ((nextData.count / data.count) * 100).toFixed(1)
              : '—';

            return (
              <div key={stage}>
                <div className="flex items-center gap-4">
                  <div className="w-24 flex-shrink-0 font-medium">{stage}</div>
                  <div className="flex-1">
                    <div className="h-12 bg-primary/20 rounded-lg flex items-center px-4">
                      <span className="font-semibold">{data.count}</span>
                    </div>
                  </div>
                  <div className="w-20 text-right">
                    {conversionRate !== '—' && (
                      <div className="text-sm text-muted-foreground">{conversionRate}% →</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ERPSectionShell>

      {/* Key Insights */}
      <ERPSectionShell
        title="Key Insights"
        description="Pipeline performance metrics"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-sm font-medium text-blue-900 dark:text-blue-200">Pipeline Velocity</div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {analytics.summary.converted_count > 0
                ? (analytics.summary.total_leads / Math.max(analytics.summary.converted_count, 1)).toFixed(1)
                : '—'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">leads per conversion</div>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="text-sm font-medium text-green-900 dark:text-green-200">Best Performer</div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
              {(() => {
                let maxType = types[0];
                let maxRevenue = analytics.by_type[types[0]].revenue;
                for (const type of types) {
                  if (analytics.by_type[type].revenue > maxRevenue) {
                    maxRevenue = analytics.by_type[type].revenue;
                    maxType = type;
                  }
                }
                return maxType.replace('_', ' ');
              })()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">by revenue</div>
          </div>

          <div className="p-4 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="text-sm font-medium text-purple-900 dark:text-purple-200">Period</div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
              {analytics.period_days}
            </div>
            <div className="text-xs text-muted-foreground mt-1">days analyzed</div>
          </div>
        </div>
      </ERPSectionShell>
    </ERPPageShell>
  );
}
