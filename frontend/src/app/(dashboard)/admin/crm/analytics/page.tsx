"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
import { apiFetch } from "@/lib/api";
import KanbanBoard, { type KanbanLead } from "@/components/crm/KanbanBoard";
import {
  getFunnelAnalytics,
  getProductPerformance,
  getTimelineAnalytics,
  getRequestTypeAnalytics,
  FunnelAnalytics,
  ProductPerformance,
  TimelineAnalytics,
  RequestTypeAnalytics,
} from "@/services/crm-analytics";

// Current metrics interface
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

type Analytics = {
  metrics: DashboardMetrics | null;
  funnel: FunnelAnalytics | null;
  products: ProductPerformance[];
  timeline: TimelineAnalytics | null;
  byType: RequestTypeAnalytics | null;
};

function FunnelStep({
  label,
  current,
  previous,
  pct,
}: {
  label: string;
  current: number;
  previous?: number;
  pct?: number;
}) {
  return (
    <div className="flex items-center gap-4 p-3 border-l-4 border-primary bg-muted/30 rounded">
      <div className="flex-1">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {current} {previous && `(${pct}% of ${previous})`}
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold text-primary">{current}</div>
        {pct && <div className="text-xs font-medium text-emerald-600">{pct}%</div>}
      </div>
    </div>
  );
}

function ProgressBar({ percentage, label }: { percentage: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary h-full transition-all"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function CRMAnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics>({
    metrics: null,
    funnel: null,
    products: [],
    timeline: null,
    byType: null,
  });
  const [activeTab, setActiveTab] = useState<"analytics" | "pipeline">("analytics");
  const [pipelineLeads, setPipelineLeads] = useState<KanbanLead[]>([]);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [metrics, funnel, products, timeline, byType] = await Promise.all([
        apiFetch<DashboardMetrics>("/api/v1/admin/crm/analytics/dashboard/"),
        getFunnelAnalytics(days),
        getProductPerformance(days),
        getTimelineAnalytics(days),
        getRequestTypeAnalytics(days),
      ]);

      setAnalytics({
        metrics: metrics || null,
        funnel,
        products: products.products || [],
        timeline,
        byType: byType.by_type || null,
      });
    } catch (err) {
      setError(accountingErrorMessage(err, "Could not load analytics."));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    if (activeTab === "analytics") {
      void loadAnalytics();
    } else if (activeTab === "pipeline" && pipelineLeads.length === 0) {
      setPipelineLoading(true);
      apiFetch('/api/v1/crm-pipeline/pipeline/')
        .then((data: any) => setPipelineLeads(Array.isArray(data) ? data : (data.results || [])))
        .catch(console.error)
        .finally(() => setPipelineLoading(false));
    }
  }, [loadAnalytics, activeTab, pipelineLeads.length]);

  const handleStageChange = async (leadId: number, newStage: string) => {
    try {
      await apiFetch(`/api/v1/crm-pipeline/pipeline/${leadId}/stage/`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: newStage }),
      });
      setPipelineLeads(pipelineLeads.map(l =>
        l.id === leadId ? { ...l, current_stage: newStage } : l
      ));
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const funnel = analytics.funnel?.funnel;

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Unified CRM Analytics"
      subtitle="Current metrics, conversion funnel, product performance, and historical trends."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM", href: ROUTES.admin.crmWorkspace },
        { label: "Analytics" },
      ]}
      actions={[{ href: ROUTES.admin.crmLeads, label: "Leads", variant: "secondary" }]}
      statusBadge={{ label: "Unified Analytics", tone: "success" as const }}
    >
      {loading && <ERPLoadingState label="Loading analytics..." />}
      {error && <ERPErrorState title="Analytics Error" description={error} />}

      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "analytics"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          📊 CRM Analytics
        </button>
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "pipeline"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🎯 Kanban Pipeline
        </button>
      </div>

      {activeTab === "analytics" && (
        <>
          {!loading && !error && analytics.metrics ? (
            <>
              {/* Current Metrics Summary */}
          <ERPSectionShell
            title="Current Metrics"
            description="Real-time stage counts and ROI indicators"
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Leads */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Total Leads
                </div>
                <div className="text-3xl font-bold text-primary mt-2">
                  {analytics.metrics.leads.count}
                </div>
              </div>

              {/* Online Requests */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Online Requests
                </div>
                <div className="text-3xl font-bold text-blue-600 mt-2">
                  {analytics.metrics.onlineRequests.count}
                </div>
              </div>

              {/* Product Requests */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Product Requests
                </div>
                <div className="text-3xl font-bold text-violet-600 mt-2">
                  {analytics.metrics.productRequests.count}
                </div>
              </div>

              {/* Subscriptions */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Active Subscriptions
                </div>
                <div className="text-3xl font-bold text-emerald-600 mt-2">
                  {analytics.metrics.subscriptions.count}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Revenue: {formatRupee(analytics.metrics.subscriptions.revenue)}
                </div>
              </div>

              {/* Direct Sales */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Direct Sales
                </div>
                <div className="text-3xl font-bold text-orange-600 mt-2">
                  {analytics.metrics.directSales.count}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Revenue: {formatRupee(analytics.metrics.directSales.revenue)}
                </div>
              </div>

              {/* Conversion Rate */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-900/20 p-4">
                <div className="text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-[0.12em] font-semibold">
                  Lead to Sale Conversion
                </div>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
                  {analytics.metrics.roi.conversionRate.toFixed(2)}%
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-2">
                  {analytics.metrics.roi.totalConversions} of {analytics.metrics.roi.totalLeads} leads
                </div>
              </div>
            </div>

            {/* ROI Summary Grid */}
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Total Revenue
                </div>
                <div className="text-2xl font-bold text-primary mt-2">
                  {formatRupee(analytics.metrics.roi.totalRevenue)}
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Avg Revenue per Lead
                </div>
                <div className="text-2xl font-bold text-primary mt-2">
                  {formatRupee(analytics.metrics.roi.avgRevenuePerLead)}
                </div>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Total Conversions
                </div>
                <div className="text-2xl font-bold text-primary mt-2">
                  {analytics.metrics.roi.totalConversions}
                </div>
              </div>
            </div>
          </ERPSectionShell>
            </>
          ) : null}

      {/* Date Range Selector for Historical Analytics */}
      <div className="my-6 flex gap-2">
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
              days === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {!loading && !error && funnel ? (
        <>
          {/* Historical Trends Header */}
          <div className="my-8 pt-6 border-t border-border">
            <h2 className="text-lg font-semibold">Historical Trends (Last {days} Days)</h2>
            <p className="text-sm text-muted-foreground mt-1">Detailed analytics showing how leads progress through your sales funnel</p>
          </div>

          {/* Conversion Funnel */}
          <ERPSectionShell
            title="Conversion Funnel"
            description="Lead-to-sale journey: how many move through each stage?"
          >
            <div className="space-y-3">
              <FunnelStep label="Leads Created" current={funnel.leads_created} />
              <FunnelStep
                label="Leads Contacted (Online Request)"
                current={funnel.leads_contacted}
                previous={funnel.leads_created}
                pct={funnel.leads_contacted_pct}
              />
              <FunnelStep
                label="Requests Created"
                current={funnel.requests_created}
                previous={funnel.leads_created}
              />
              <FunnelStep
                label="Quotes Sent"
                current={funnel.requests_quoted}
                previous={funnel.requests_created}
                pct={funnel.requests_quoted_pct}
              />
              <FunnelStep
                label="Quotes Accepted"
                current={funnel.requests_accepted}
                previous={funnel.requests_quoted}
                pct={funnel.requests_accepted_pct}
              />
              <FunnelStep
                label="Approved"
                current={funnel.requests_approved}
                previous={funnel.requests_accepted}
                pct={funnel.requests_approved_pct}
              />
              <FunnelStep
                label="Conversions (Subscriptions + Sales)"
                current={funnel.total_conversions}
                previous={funnel.leads_created}
                pct={funnel.conversion_rate_lead_to_sale}
              />
            </div>

            {/* Conversion Rate Summary */}
            <div className="mt-6 grid gap-4 md:grid-cols-3 bg-primary/5 rounded-xl p-4 border border-primary/20">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Lead → Contact Rate
                </div>
                <div className="text-2xl font-bold text-primary mt-2">
                  {funnel.leads_contacted_pct}%
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Quote → Accept Rate
                </div>
                <div className="text-2xl font-bold text-emerald-600 mt-2">
                  {funnel.requests_accepted_pct}%
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Lead → Sale Rate
                </div>
                <div className="text-2xl font-bold text-blue-600 mt-2">
                  {funnel.conversion_rate_lead_to_sale}%
                </div>
              </div>
            </div>
          </ERPSectionShell>

          {/* By Request Type */}
          {analytics.byType && Object.keys(analytics.byType).length > 0 && (
            <ERPSectionShell
              title="Performance by Request Type"
              description="How each request type (EMI, Direct Sale, Rent, Lease) performs."
            >
              <div className="grid gap-4 md:grid-cols-2">
                {Object.entries(analytics.byType).map(([type, stats]) => (
                  <div key={type} className="rounded-lg border border-border bg-card p-4">
                    <div className="font-semibold text-foreground mb-3">
                      {type.replace(/_/g, " ")}
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Requests:</span>
                        <span className="font-medium">{stats.requests_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Approved:</span>
                        <span className="font-medium">{stats.approved_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Conversion:</span>
                        <span className="font-bold text-emerald-600">{stats.conversion_rate}%</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-border">
                        <span className="text-muted-foreground">Total Value:</span>
                        <span className="font-semibold">{formatRupee(stats.total_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Value:</span>
                        <span className="font-semibold">{formatRupee(stats.avg_amount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ERPSectionShell>
          )}

          {/* Product Performance */}
          {analytics.products.length > 0 && (
            <ERPSectionShell
              title="Product Performance"
              description="Which products drive the most requests and revenue?"
            >
              <div className="overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Requests</th>
                      <th className="px-4 py-3 text-right">Approved</th>
                      <th className="px-4 py-3 text-right">Conv. Rate</th>
                      <th className="px-4 py-3 text-right">Avg Quote</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.products.map((product) => (
                      <tr key={product.product_id} className="border-t border-border hover:bg-muted/20 transition">
                        <td className="px-4 py-3 font-medium">
                          <Link
                            href={`${ROUTES.admin.products}/${product.product_id}`}
                            className="text-primary hover:underline"
                          >
                            {product.product_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{product.requests_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{product.approved_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <span className="font-semibold text-emerald-600">{product.conversion_rate}%</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatRupee(product.avg_quoted_price)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {formatRupee(product.total_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ERPSectionShell>
          )}

          {/* Timeline Trends */}
          {analytics.timeline && (
            <ERPSectionShell
              title="Daily Trends"
              description="How many leads, requests, and conversions per day?"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="font-semibold text-foreground mb-3">Leads vs Requests</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Leads:</span>
                      <span className="font-semibold">
                        {analytics.timeline.daily_leads.reduce((sum, d) => sum + d.count, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg per Day:</span>
                      <span className="font-semibold">
                        {(
                          analytics.timeline.daily_leads.reduce((sum, d) => sum + d.count, 0) /
                          (analytics.timeline.daily_leads.length || 1)
                        ).toFixed(1)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-border">
                      <span className="text-muted-foreground">Total Requests:</span>
                      <span className="font-semibold">
                        {analytics.timeline.daily_requests.reduce((sum, d) => sum + d.count, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avg per Day:</span>
                      <span className="font-semibold">
                        {(
                          analytics.timeline.daily_requests.reduce((sum, d) => sum + d.count, 0) /
                          (analytics.timeline.daily_requests.length || 1)
                        ).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="font-semibold text-foreground mb-3">Conversions</div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Approvals:</span>
                      <span className="font-semibold">
                        {analytics.timeline.daily_approvals.reduce((sum, d) => sum + d.count, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subscriptions:</span>
                      <span className="font-semibold text-emerald-600">
                        {analytics.timeline.daily_subscriptions.reduce((sum, d) => sum + d.count, 0)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Direct Sales:</span>
                      <span className="font-semibold text-blue-600">
                        {analytics.timeline.daily_sales.reduce((sum, d) => sum + d.count, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </ERPSectionShell>
          )}

          {/* Info Box */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
            <strong>Data Range:</strong> Last {days} days
            {analytics.funnel?.date_range && (
              <>
                {" "}
                ({new Date(analytics.funnel.date_range.start).toLocaleDateString()} to{" "}
                {new Date(analytics.funnel.date_range.end).toLocaleDateString()})
              </>
            )}
          </div>
        </>
      ) : !loading && !error ? (
        <ERPEmptyState
          title="No analytics data"
          description="Start creating leads and requests to see analytics."
        />
      ) : null}
      </>
      )}

      {activeTab === "pipeline" && (
        <div className="mt-4">
          {pipelineLoading ? (
            <ERPLoadingState label="Loading pipeline..." />
          ) : pipelineLeads.length === 0 ? (
            <ERPEmptyState
              title="No leads in pipeline"
              description="No active leads were found to display on the board."
              icon="leads"
            />
          ) : (
            <KanbanBoard
              leads={pipelineLeads}
              onStageChange={handleStageChange}
              onLeadClick={() => {}}
            />
          )}
        </div>
      )}
    </ERPPageShell>
  );
}
