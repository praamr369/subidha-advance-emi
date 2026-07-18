"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  CrmOperationalWorkspace,
  type CrmWorkspaceSectionCard,
} from "@/components/workspace/CrmOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";
import { formatRupee } from "@/lib/utils/currency";
import { getAdminCrmWorkspace, type CrmWorkspacePayload } from "@/services/admin-erp";
import { listCustomers } from "@/services/customers";
import { getCrmOverview, type CrmOverviewResponse } from "@/services/crm";
import { getCrmFunnel, LEAD_STAGE_LABELS, type CrmFunnelResponse } from "@/services/crm-module";

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

function findPipelineCount(payload: CrmWorkspacePayload | null, key: string): number {
  const row = payload?.crm_pipeline?.find((entry) => entry.key === key);
  return Number(row?.count || 0);
}

function FunnelBar({ stage, count, pct, isLost }: { stage: string; count: number; pct: number; isLost: boolean }) {
  const label = LEAD_STAGE_LABELS[stage as keyof typeof LEAD_STAGE_LABELS] || stage;
  const barColor = isLost
    ? "bg-gray-300"
    : stage === "CONVERTED"
    ? "bg-green-500"
    : "bg-blue-500";

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 flex-shrink-0 text-right text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex-1 min-w-0">
        <div className="h-5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
      </div>
      <div className="w-14 flex-shrink-0 text-xs text-right">
        <span className="font-semibold text-foreground">{count}</span>
        <span className="text-muted-foreground"> ({pct}%)</span>
      </div>
    </div>
  );
}

function SourceBreakdown({ rows }: { rows: CrmFunnelResponse["source_breakdown"] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Lead Source Conversion</div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Source</th>
              <th className="px-4 py-2.5 text-right">Leads</th>
              <th className="px-4 py-2.5 text-right">Converted</th>
              <th className="px-4 py-2.5 text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((row) => (
              <tr key={row.source} className="border-t border-border/60">
                <td className="px-4 py-2.5 font-medium text-foreground">
                  {row.source.replace(/_/g, " ")}
                </td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{row.total}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">{row.converted}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`font-semibold ${row.conversion_rate >= 30 ? "text-green-700" : row.conversion_rate >= 10 ? "text-yellow-700" : "text-muted-foreground"}`}>
                    {row.conversion_rate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminCrmOverviewPage() {
  const [workspace, setWorkspace] = useState<CrmWorkspacePayload | null>(null);
  const [overview, setOverview] = useState<CrmOverviewResponse | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [funnel, setFunnel] = useState<CrmFunnelResponse | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      const data: DashboardMetrics = await apiFetch("/api/v1/admin/crm/analytics/dashboard/");
      setMetrics(data);
    } catch (err) {
      console.error("Error loading dashboard metrics:", err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const [workspaceResult, overviewResult, customerResult, funnelResult] = await Promise.allSettled([
        getAdminCrmWorkspace(),
        getCrmOverview(),
        listCustomers({ page: 1 }),
        getCrmFunnel(),
      ]);

      if (!active) return;

      if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
      else { setWorkspace(null); setError("CRM workspace status is unavailable."); }

      if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      else setOverview(null);

      if (customerResult.status === "fulfilled") setCustomerCount(Number(customerResult.value.count || 0));
      else setCustomerCount(null);

      if (funnelResult.status === "fulfilled") setFunnel(funnelResult.value);
      else setFunnel(null);
    }

    void load();
    void loadMetrics();
    return () => { active = false; };
  }, [loadMetrics]);

  const cards = useMemo<CrmWorkspaceSectionCard[]>(() => {
    const customersLoaded = customerCount !== null;
    const partyCount = overview?.summary.party_count;
    const leadsCount = overview?.summary.lead_count;
    const followupsCount = overview?.summary.due_follow_up_count;
    const supportCount = findPipelineCount(workspace, "support_open");
    const kycCount = findPipelineCount(workspace, "pending_kyc");

    return [
      {
        key: "registered-customers",
        label: "Registered Customers",
        purpose: "Canonical customer profiles used by direct-sale existing-customer selection.",
        href: ROUTES.admin.customers,
        count: customersLoaded ? customerCount : null,
        status: customersLoaded ? "ready" : "loading",
        statusMessage: customersLoaded ? `${customerCount} customer profiles.` : "Loading customer register status...",
      },
      {
        key: "crm-parties",
        label: "CRM Parties",
        purpose: "Party 360 entries linked across customer, lead, partner, vendor, and staff roles.",
        href: ROUTES.admin.crmParties,
        count: typeof partyCount === "number" ? partyCount : null,
        status: typeof partyCount === "number" ? "ready" : "loading",
        statusMessage: typeof partyCount === "number" ? `${partyCount} party records.` : "Loading party directory status...",
      },
      {
        key: "leads",
        label: "Leads / Enquiries",
        purpose: "Lead pipeline and enquiry conversion workflow.",
        href: ROUTES.admin.crmLeads,
        count: funnel ? funnel.summary.total_leads : (typeof leadsCount === "number" ? leadsCount : null),
        status: funnel ? "ready" : "loading",
        statusMessage: funnel
          ? `${funnel.summary.total_leads} leads · ${funnel.summary.overall_conversion_rate}% conversion rate.`
          : "Loading leads status...",
      },
      {
        key: "followups",
        label: "Follow-ups",
        purpose: "Open interaction follow-up queue and due-call reminders.",
        href: ROUTES.admin.crmFollowUps,
        count: typeof followupsCount === "number" ? followupsCount : null,
        status: typeof followupsCount === "number" ? "ready" : "loading",
        statusMessage: typeof followupsCount === "number" ? `${followupsCount} due follow-ups.` : "Loading follow-up queue status...",
      },
      {
        key: "kyc",
        label: "KYC",
        purpose: "Pending customer KYC verification queue for operational controls.",
        href: ROUTES.admin.crmKyc,
        count: workspace ? kycCount : null,
        status: workspace ? "ready" : "loading",
        statusMessage: workspace ? `${kycCount} KYC records pending review.` : "Loading KYC queue status...",
      },
      {
        key: "support",
        label: "Support / Service Cases",
        purpose: "Customer service and support escalation queue.",
        href: ROUTES.admin.supportRequests,
        count: workspace ? supportCount : null,
        status: workspace ? "ready" : "loading",
        statusMessage: workspace ? `${supportCount} open support/service cases.` : "Loading support queue status...",
      },
    ];
  }, [customerCount, overview, workspace, funnel]);

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="Unified CRM Dashboard"
      subtitle="Complete workflow: Leads → Online Requests → Product/Subscription Requests → Sales with ROI tracking."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM" },
      ]}
      actions={[
        { href: ROUTES.admin.crmLeads, label: "Leads", variant: "secondary" },
        { href: "/admin/crm/analytics", label: "Analytics", variant: "secondary" },
        { href: ROUTES.admin.crmPipeline, label: "Pipeline", variant: "primary" },
      ]}
      statusBadge={{ label: "Real-time tracking", tone: "success" }}
      stats={[
        { label: "Registered Customers", value: customerCount ?? "—", tone: "info" },
        { label: "Active Leads", value: metrics?.leads.count ?? (funnel ? funnel.summary.total_leads : (overview?.summary.lead_count ?? "—")), tone: "default" },
        { label: "Conversions", value: metrics?.roi.totalConversions ?? "—", tone: "default" },
        { label: "Revenue", value: metrics?.roi.totalRevenue ? formatRupee(metrics.roi.totalRevenue) : "—", tone: "success" },
      ]}
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Unified Dashboard Metrics */}
      {metrics && (
        <ERPSectionShell
          title="Conversion Flow"
          description="Lead-to-sale journey at a glance"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <span className="font-medium text-foreground">Leads Created</span>
              <div className="text-2xl font-bold text-primary">{metrics.leads.count}</div>
            </div>

            <div className="text-center text-xs text-muted-foreground">↓</div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <span className="font-medium text-foreground">Online Requests</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-blue-600">{metrics.onlineRequests.count}</div>
                <div className="text-xs text-muted-foreground">{metrics.leads.count > 0 ? ((metrics.onlineRequests.count / metrics.leads.count * 100).toFixed(1)) : "0"}% of leads</div>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">↓</div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <span className="font-medium text-foreground">Product/Sub Requests</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-violet-600">{metrics.productRequests.count + metrics.subscriptionRequests.count}</div>
                <div className="text-xs text-muted-foreground">{metrics.onlineRequests.count > 0 ? (((metrics.productRequests.count + metrics.subscriptionRequests.count) / metrics.onlineRequests.count * 100).toFixed(1)) : "0"}% of requests</div>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">↓</div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <span className="font-medium text-foreground">Active Subscriptions</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-emerald-600">{metrics.subscriptions.count}</div>
                <div className="text-xs text-muted-foreground">{metrics.roi.conversionRate.toFixed(1)}% overall conversion</div>
              </div>
            </div>

            <div className="text-center text-xs text-muted-foreground">+</div>

            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
              <span className="font-medium text-foreground">Direct Sales</span>
              <div className="text-right">
                <div className="text-2xl font-bold text-orange-600">{metrics.directSales.count}</div>
              </div>
            </div>
          </div>
        </ERPSectionShell>
      )}

      {/* ROI Summary */}
      {metrics && (
        <ERPSectionShell
          title="ROI Summary"
          description="Business metrics and performance"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Lead → Sale Conversion
              </div>
              <div className="text-3xl font-bold text-primary mt-2">
                {metrics.roi.conversionRate.toFixed(2)}%
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {metrics.roi.totalConversions} of {metrics.roi.totalLeads} leads
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Total Revenue
              </div>
              <div className="text-3xl font-bold text-emerald-600 mt-2">
                {formatRupee(metrics.roi.totalRevenue)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                From {metrics.roi.totalConversions} sales
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground uppercase tracking-[0.12em]">
                Avg Revenue/Lead
              </div>
              <div className="text-3xl font-bold text-blue-600 mt-2">
                {formatRupee(metrics.roi.avgRevenuePerLead)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Per converted lead
              </div>
            </div>
          </div>
        </ERPSectionShell>
      )}

      <ERPSectionShell title="CRM desk" description="Customer intelligence routing without mixing financial mutations into the CRM layer.">
        <ERPAuditNote title="Operational separation" tone="info">
          <p>
            Direct-sale existing-customer search uses the registered customer source (
            <code>/api/v1/admin/customers/search/</code>). CRM parties remain a separate model and are not submitted as{" "}
            <code>customer</code> IDs in direct-sale payloads.
          </p>
          <p className="mt-2">
            CRM Pipeline visibility is handled through the Leads / Enquiries and Follow-ups sections in this workspace.
          </p>
          <p className="mt-2">
            Create-customer-from-lead: use the{" "}
            <Link href={ROUTES.admin.crmLeads} className="font-medium text-primary underline-offset-4 hover:underline">
              Leads register
            </Link>
            {" "}→ lead detail → Convert to Customer button when the lead reaches Ready to Convert stage.
          </p>
        </ERPAuditNote>

        <CrmOperationalWorkspace cards={cards} />
      </ERPSectionShell>

      {/* Funnel analytics */}
      {funnel ? (
        <ERPSectionShell
          title="Sales Funnel"
          description={`${funnel.summary.total_leads} total leads · ${funnel.summary.overall_conversion_rate}% overall conversion rate · ${funnel.summary.active} active`}
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Stage Distribution</div>
              <div className="space-y-2">
                {funnel.stages.map((s) => (
                  <FunnelBar
                    key={s.stage}
                    stage={s.stage}
                    count={s.count}
                    pct={s.pct_of_total}
                    isLost={s.stage === "LOST"}
                  />
                ))}
              </div>

              <div className="mt-5 flex gap-4 flex-wrap">
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                  <div className="text-xl font-bold text-green-700">{funnel.summary.converted}</div>
                  <div className="text-xs text-muted-foreground">Converted</div>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                  <div className="text-xl font-bold text-foreground">{funnel.summary.active}</div>
                  <div className="text-xs text-muted-foreground">Active</div>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3 text-center">
                  <div className="text-xl font-bold text-muted-foreground">{funnel.summary.lost}</div>
                  <div className="text-xs text-muted-foreground">Lost</div>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-center">
                  <div className="text-xl font-bold text-green-700">{funnel.summary.overall_conversion_rate}%</div>
                  <div className="text-xs text-muted-foreground">Conversion rate</div>
                </div>
              </div>
            </div>

            <div>
              <SourceBreakdown rows={funnel.source_breakdown} />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <Link
              href={ROUTES.admin.crmLeads}
              className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              View All Leads
            </Link>
            <Link
              href={ROUTES.admin.crmPipeline}
              className="rounded-xl border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Open Pipeline Board
            </Link>
          </div>
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
