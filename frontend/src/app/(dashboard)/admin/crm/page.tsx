"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import {
  CrmOperationalWorkspace,
} from "@/components/workspace/CrmOperationalWorkspace";
import { ROUTES } from "@/lib/routes";
import { getAdminCrmWorkspace, getAdminWorkbenchItems, type CrmWorkspacePayload, type WorkbenchItem } from "@/services/admin-erp";
import { listCustomers } from "@/services/customers";
import { getCrmOverview, type CrmOverviewResponse } from "@/services/crm";
import { getCrmFunnel, LEAD_STAGE_LABELS, type CrmFunnelResponse } from "@/services/crm-module";

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
  const [assignedTasks, setAssignedTasks] = useState<WorkbenchItem[] | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [overview, setOverview] = useState<CrmOverviewResponse | null>(null);
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [funnel, setFunnel] = useState<CrmFunnelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const [workspaceResult, tasksResult, overviewResult, customerResult, funnelResult] = await Promise.allSettled([
        getAdminCrmWorkspace(),
        getAdminWorkbenchItems({ status: "OPEN" }),
        getCrmOverview(),
        listCustomers({ page: 1 }),
        getCrmFunnel(),
      ]);

      if (!active) return;

      if (workspaceResult.status === "fulfilled") setWorkspace(workspaceResult.value);
      else { setWorkspace(null); setError("CRM workspace status is unavailable."); }

      if (tasksResult.status === "fulfilled") setAssignedTasks(tasksResult.value.results);
      else { setAssignedTasks(null); setTaskError("Could not load workbench tasks."); }

      if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
      else setOverview(null);

      if (customerResult.status === "fulfilled") setCustomerCount(Number(customerResult.value.count || 0));
      else setCustomerCount(null);

      if (funnelResult.status === "fulfilled") setFunnel(funnelResult.value);
      else setFunnel(null);
    }

    void load();
    return () => { active = false; };
  }, []);

  return (
    <ERPPageShell
      eyebrow="CRM"
      title="CRM Workspace"
      subtitle="Operational CRM hub with explicit separation between registered customers and CRM party records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM" },
      ]}
      actions={[
        { href: ROUTES.admin.crmLeads, label: "Leads", variant: "secondary" },
        { href: "/admin/crm/dashboard", label: "Dashboard", variant: "secondary" },
        { href: ROUTES.admin.crmAnalytics, label: "Pipeline", variant: "primary" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
      stats={[
        { label: "Registered Customers", value: customerCount ?? "—", tone: "info", hint: "Active accounts" },
        {
          label: "Active Leads",
          value: funnel ? funnel.summary.active : (overview?.summary.lead_count ?? "—"),
          tone: "default",
          hint: funnel ? `${funnel.summary.converted} converted of ${funnel.summary.total_leads}` : undefined,
        },
        {
          label: "Due Follow-ups",
          value: overview?.summary.due_follow_up_count ?? "—",
          tone: typeof overview?.summary.due_follow_up_count === "number" && overview.summary.due_follow_up_count > 0 ? "warning" : "success",
          hint: typeof overview?.summary.due_follow_up_count === "number" && overview.summary.due_follow_up_count > 0 ? "Needs action today" : "All caught up",
        },
        {
          label: "Conversion Rate",
          value: funnel ? `${funnel.summary.overall_conversion_rate}%` : "—",
          tone: funnel && funnel.summary.overall_conversion_rate >= 30 ? "success" : "default",
          hint: "Leads → customers",
        },
      ]}
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {/* KPI CARDS PORTED FROM WORKBENCH */}
      <ERPSectionShell title="Dashboard KPIs" description="Real-time metrics">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 to-primary/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">Total Customers</div>
            <div className="text-4xl font-bold text-primary mt-2">{customerCount ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Active accounts</div>
          </div>
          <div className="rounded-lg border border-border bg-gradient-to-br from-blue-500/5 to-blue-500/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">Active Leads</div>
            <div className="text-4xl font-bold text-blue-600 mt-2">{funnel ? funnel.summary.active : "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">In pipeline</div>
          </div>
          <div className="rounded-lg border border-border bg-gradient-to-br from-amber-500/5 to-amber-500/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">Due Follow-ups</div>
            <div className="text-4xl font-bold text-amber-600 mt-2">{overview?.summary.due_follow_up_count ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Awaiting action</div>
          </div>
          <div className="rounded-lg border border-border bg-gradient-to-br from-green-500/5 to-green-500/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">Conversion Rate</div>
            <div className="text-4xl font-bold text-green-600 mt-2">{funnel ? `${funnel.summary.overall_conversion_rate}%` : "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Leads to customers</div>
          </div>
          <div className="rounded-lg border border-border bg-gradient-to-br from-purple-500/5 to-purple-500/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">CRM Parties</div>
            <div className="text-4xl font-bold text-purple-600 mt-2">{overview?.summary.party_count ?? "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Total directory records</div>
          </div>
          <div className="rounded-lg border border-border bg-gradient-to-br from-red-500/5 to-red-500/10 p-6">
            <div className="text-sm text-muted-foreground font-medium">Pending Approvals</div>
            <div className="text-4xl font-bold text-red-600 mt-2">{workspace ? (findPipelineCount(workspace, "pending_kyc") + findPipelineCount(workspace, "subscription_requests_pending")) : "—"}</div>
            <div className="text-xs text-muted-foreground mt-2">Action items</div>
          </div>
        </div>
      </ERPSectionShell>

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

        <CrmOperationalWorkspace 
          workspace={workspace} 
          assignedTasks={assignedTasks} 
          taskError={taskError} 
        />
      </ERPSectionShell>

      <ERPSectionShell title="Consumer Requests & Warranty" description="Manage post-sale and post-subscription consumer requests.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/admin/consumer/defect-claims" className="group flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5">
            <div className="flex flex-col">
              <span>Defect Claims</span>
              <span className="text-xs text-muted-foreground font-normal mt-0.5">Consumer-reported defects</span>
            </div>
          </Link>
          <Link href="/admin/consumer/return-requests" className="group flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5">
            <div className="flex flex-col">
              <span>Return Requests</span>
              <span className="text-xs text-muted-foreground font-normal mt-0.5">Consumer return tickets</span>
            </div>
          </Link>
          <Link href="/admin/warranty/claims" className="group flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5">
            <div className="flex flex-col">
              <span>Warranty Claims</span>
              <span className="text-xs text-muted-foreground font-normal mt-0.5">Manage warranty cases</span>
            </div>
          </Link>
        </div>
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
              href={ROUTES.admin.crmAnalytics}
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
