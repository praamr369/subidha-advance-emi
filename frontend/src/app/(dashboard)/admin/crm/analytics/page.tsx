"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "react-qr-code";

import { accountingErrorMessage } from "@/components/accounting/shared";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import { formatRupee } from "@/lib/utils/currency";
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
import { getCrmAnalyticsDashboard, listCrmPipelineLeads, updateCrmPipelineStage } from "@/services/crm";

// Current metrics interface
interface DashboardMetrics {
  visitors?: {
    stage: string;
    visits: number;
    unique: number;
    registered: number;
    unregistered: number;
    regConversionRate: number;
  };
  productSentiment?: {
    likes: number;
    dislikes: number;
    totalReactions: number;
    likeRatio: number;
  };
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
  const [activeTab, setActiveTab] = useState<"analytics" | "pipeline" | "campaigns">("analytics");
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
        getCrmAnalyticsDashboard(),
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
      listCrmPipelineLeads()
        .then((data: any) => setPipelineLeads(Array.isArray(data) ? data : (data.results || [])))
        .catch(console.error)
        .finally(() => setPipelineLoading(false));
    }
  }, [loadAnalytics, activeTab, pipelineLeads.length]);

  const handleStageChange = async (leadId: number, newStage: string) => {
    try {
      await updateCrmPipelineStage(leadId, newStage);
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
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-3 font-medium text-sm transition-colors ${
            activeTab === "campaigns"
              ? "text-primary border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          🚀 Campaign & Ad Tools
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
              {/* Webapp Public Visits */}
              <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/40 dark:bg-sky-900/20 p-4">
                <div className="text-xs text-sky-700 dark:text-sky-300 uppercase tracking-[0.12em] font-semibold">
                  Public Web Visits
                </div>
                <div className="text-3xl font-bold text-sky-600 dark:text-sky-400 mt-2">
                  {analytics.metrics.visitors?.visits ?? 0}
                </div>
                <div className="text-xs text-sky-700 dark:text-sky-300 mt-2">
                  {analytics.metrics.visitors?.unique ?? 0} unique visitors ({analytics.metrics.visitors?.registered ?? 0} registered)
                </div>
              </div>

              {/* Visitor to Registration Conversion */}
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800/40 dark:bg-indigo-900/20 p-4">
                <div className="text-xs text-indigo-700 dark:text-indigo-300 uppercase tracking-[0.12em] font-semibold">
                  Visitor → Register Rate
                </div>
                <div className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
                  {(analytics.metrics.visitors?.regConversionRate ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-indigo-700 dark:text-indigo-300 mt-2">
                  {analytics.metrics.visitors?.unregistered ?? 0} anonymous browsing visitors
                </div>
              </div>

              {/* Product Like Sentiment */}
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:border-rose-800/40 dark:bg-rose-900/20 p-4">
                <div className="text-xs text-rose-700 dark:text-rose-300 uppercase tracking-[0.12em] font-semibold">
                  Product Approval (Likes)
                </div>
                <div className="text-3xl font-bold text-rose-600 dark:text-rose-400 mt-2">
                  {(analytics.metrics.productSentiment?.likeRatio ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-rose-700 dark:text-rose-300 mt-2">
                  👍 {analytics.metrics.productSentiment?.likes ?? 0} likes • 👎 {analytics.metrics.productSentiment?.dislikes ?? 0} dislikes
                </div>
              </div>

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

          {/* Connected Web Analytics & Campaign Attribution */}
          <div className="mb-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-semibold text-foreground flex flex-wrap items-center gap-2">
                  <span>🌐</span> Connected Marketing & Traffic Analytics
                  {funnel.is_ga_active ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      GA4 Active ({funnel.google_analytics_id})
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                      GA4 Not Configured
                    </span>
                  )}
                  {funnel.is_meta_active ? (
                    <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-950/60 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
                      Meta Pixel Active ({funnel.meta_pixel_id})
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                      Meta Pixel Inactive
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Real-time connection between public website visitors, Google Analytics campaigns, and CRM sales conversions.
                </p>
              </div>
              <Link
                href="/admin/settings/business-setup/profile"
                className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition"
              >
                Configure Web & SEO Settings →
              </Link>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Traffic Acquisition Referrers */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Top Web Traffic Referrers
                </div>
                {funnel.traffic_sources && funnel.traffic_sources.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {funnel.traffic_sources.map((ts, idx) => (
                      <li key={idx} className="flex justify-between items-center text-muted-foreground">
                        <span className="truncate max-w-[200px]" title={ts.source}>{ts.source || "Direct / Internal"}</span>
                        <span className="font-semibold text-foreground">{ts.visits} visits</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Direct visits / Organic search traffic active.</p>
                )}
              </div>

              {/* Lead Attribution Channels */}
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
                  Lead Acquisition Sources
                </div>
                {funnel.lead_sources && funnel.lead_sources.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {funnel.lead_sources.map((ls, idx) => (
                      <li key={idx} className="flex justify-between items-center text-muted-foreground">
                        <span className="font-mono text-[11px] text-foreground">{ls.source}</span>
                        <span className="font-semibold text-foreground">{ls.leads} leads</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Website enquiries recorded directly in CRM.</p>
                )}
              </div>

              {/* Visitor to Lead Conversion Card */}
              <div className="rounded-lg border border-border bg-muted/20 p-3 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                    Visitor → Lead Conversion
                  </div>
                  <div className="text-2xl font-bold text-primary mt-1">
                    {funnel.visitor_to_lead_pct ?? 0}%
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ratio of public unique visitors who submitted an inquiry or requested a quote.
                  </p>
                </div>
                <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-2 pt-2 border-t border-border">
                  ✓ High purchase intent tracked
                </div>
              </div>
            </div>
          </div>

          {/* Conversion Funnel */}
          <ERPSectionShell
            title="Conversion Funnel"
            description="Visitor-to-sale journey: tracks public visits, registrations, leads, and final conversions"
          >
            <div className="space-y-3">
              {/* Webapp Visitor Milestones */}
              <FunnelStep
                label="Public Web Visits"
                current={funnel.public_visits ?? 0}
              />
              <FunnelStep
                label="Unique Web Visitors"
                current={funnel.unique_visitors ?? 0}
                previous={funnel.public_visits ?? 0}
                pct={
                  (funnel.public_visits ?? 0) > 0
                    ? Math.round(((funnel.unique_visitors ?? 0) / (funnel.public_visits ?? 1)) * 100)
                    : undefined
                }
              />
              <FunnelStep
                label="Registered Customer Accounts"
                current={funnel.registered_visitors ?? 0}
                previous={funnel.unique_visitors ?? 0}
                pct={funnel.visitor_to_registered_pct}
              />
              <FunnelStep
                label="Anonymous / Browsing Visitors"
                current={funnel.unregistered_visitors ?? 0}
                previous={funnel.unique_visitors ?? 0}
              />
              <FunnelStep
                label="Leads / Enquiries Created"
                current={funnel.leads_created}
                previous={funnel.unique_visitors ?? 0}
                pct={funnel.visitor_to_lead_pct}
              />
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
            <div className="mt-6 grid gap-4 md:grid-cols-4 bg-primary/5 rounded-xl p-4 border border-primary/20">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Visitor → Register Rate
                </div>
                <div className="text-2xl font-bold text-indigo-600 mt-2">
                  {funnel.visitor_to_registered_pct ?? 0}%
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                  Visitor → Lead Rate
                </div>
                <div className="text-2xl font-bold text-primary mt-2">
                  {funnel.visitor_to_lead_pct ?? 0}%
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

          {/* Product Performance & Popularity Sentiment */}
          {analytics.products.length > 0 && (
            <ERPSectionShell
              title="Product Performance & Customer Sentiment"
              description="Track views, customer likes/dislikes, approval ratio, and conversion to orders."
            >
              <div className="overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[1000px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3 text-right">Views</th>
                      <th className="px-4 py-3 text-right">Likes (👍)</th>
                      <th className="px-4 py-3 text-right">Dislikes (👎)</th>
                      <th className="px-4 py-3 text-right">Approval %</th>
                      <th className="px-4 py-3 text-center">Sentiment</th>
                      <th className="px-4 py-3 text-right">Requests</th>
                      <th className="px-4 py-3 text-right">Conv. Rate</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.products.map((product) => {
                      const sentiment = product.sentiment || "NO_VOTES";
                      const sentimentBadge =
                        sentiment === "HIGHLY_LIKED" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                            Loved
                          </span>
                        ) : sentiment === "POPULAR" ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300">
                            Popular
                          </span>
                        ) : sentiment === "MIXED" ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                            Mixed
                          </span>
                        ) : sentiment === "LOW_APPROVAL" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/40 px-2 py-0.5 text-[11px] font-semibold text-rose-800 dark:text-rose-300">
                            Needs Review
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No votes</span>
                        );

                      return (
                        <tr key={product.product_id} className="border-t border-border hover:bg-muted/20 transition">
                          <td className="px-4 py-3 font-medium">
                            <Link
                              href={`${ROUTES.admin.products}/${product.product_id}`}
                              className="text-primary hover:underline"
                            >
                              {product.product_name}
                            </Link>
                            {product.product_code && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                ({product.product_code})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {product.views_count ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                            {product.likes_count ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                            {product.dislikes_count ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {(product.total_reactions ?? 0) > 0 ? (
                              <span
                                className={
                                  (product.like_ratio ?? 0) >= 70
                                    ? "text-emerald-600"
                                    : (product.like_ratio ?? 0) >= 40
                                    ? "text-amber-600"
                                    : "text-rose-600"
                                }
                              >
                                {product.like_ratio}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">{sentimentBadge}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{product.requests_count}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className="font-semibold text-emerald-600">{product.conversion_rate}%</span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">
                            {formatRupee(product.total_revenue)}
                          </td>
                        </tr>
                      );
                    })}
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

      {activeTab === "campaigns" && (
        <div className="mt-4">
          <CampaignLinkGenerator />
        </div>
      )}
    </ERPPageShell>
  );
}

function CampaignLinkGenerator() {
  const [targetPath, setTargetPath] = useState("/");
  const [channel, setChannel] = useState("whatsapp");
  const [campaignName, setCampaignName] = useState("festival_offer");
  const [copied, setCopied] = useState(false);

  const channelPresets: Record<string, { source: string; medium: string; label: string; icon: string }> = {
    whatsapp: { source: "whatsapp", medium: "broadcast", label: "WhatsApp Broadcast / Status", icon: "💬" },
    facebook: { source: "facebook", medium: "cpc", label: "Meta / Facebook Ad Campaign", icon: "📘" },
    instagram: { source: "instagram", medium: "social_story", label: "Instagram Story / Bio Link", icon: "📸" },
    google: { source: "google", medium: "cpc", label: "Google Search / Local Ads", icon: "🔍" },
    offline_qr: { source: "offline_print", medium: "qr_code", label: "Newspaper / Flyer Print QR", icon: "📰" },
    showroom_qr: { source: "showroom_standee", medium: "in_store_qr", label: "Showroom Display Standee QR", icon: "🏬" },
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://subidha.com";
  const cleanSource = channelPresets[channel]?.source || "campaign";
  const cleanMedium = channelPresets[channel]?.medium || "referral";
  const cleanCampaign = (campaignName || "promo").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");

  const generatedUrl = `${origin}${targetPath.startsWith("/") ? targetPath : `/${targetPath}`}?utm_source=${cleanSource}&utm_medium=${cleanMedium}&utm_campaign=${cleanCampaign}`;

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <ERPSectionShell
        title="Marketing & Advertising Campaign Link Generator"
        description="Generate trackable campaign links and printable QR codes with UTM parameters that directly attribute leads and visitor traffic into your CRM funnel."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Destination Page
              </label>
              <select
                value={targetPath}
                onChange={(e) => setTargetPath(e.target.value)}
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="/">Home Page (/)</option>
                <option value="/lucky-plan">SFEMI Plans (/lucky-plan)</option>
                <option value="/products">Product Catalog (/products)</option>
                <option value="/rent">Furniture Rental (/rent)</option>
                <option value="/lease">Furniture Leasing (/lease)</option>
                <option value="/apply">Customer Application Form (/apply)</option>
                <option value="/contact">Contact & Showroom Location (/contact)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Marketing Channel Preset
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(channelPresets).map(([key, val]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChannel(key)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition ${
                      channel === key
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    <span>{val.icon}</span>
                    <span className="truncate">{val.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign Name / Identifier
              </label>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. diwali_dhamaka_2026 or asansol_sofa_offer"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Keep it short, lowercase, without spaces. Helps categorize sales in your CRM funnel.
              </p>
            </div>

            <div className="rounded-xl border border-input bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Generated Trackable URL
              </div>
              <div className="break-all font-mono text-xs text-foreground bg-background p-2.5 rounded-lg border border-input select-all">
                {generatedUrl}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                {copied ? "✓ Copied to Clipboard!" : "📋 Copy Trackable Link"}
              </button>
            </div>
          </div>

          {/* QR Code & Preview */}
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/10 p-6 text-center">
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-border">
              <QRCode value={generatedUrl} size={180} />
            </div>
            <div className="mt-4 max-w-sm">
              <div className="text-sm font-bold text-foreground">
                Instant Campaign QR Code
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Scan with any smartphone camera to test. You can right-click the QR image to copy or save for printing on banners, flyers, or showroom display boards.
              </p>
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-2.5 text-left text-[11px] text-emerald-800 dark:text-emerald-300">
                <strong>✓ CRM Attribution Active:</strong> Anyone scanning this QR or clicking the link will be automatically recognized by the CRM attribution engine with source <code className="font-mono font-bold">{cleanSource}</code> and campaign <code className="font-mono font-bold">{cleanCampaign}</code>.
              </div>
            </div>
          </div>
        </div>
      </ERPSectionShell>
    </div>
  );
}
