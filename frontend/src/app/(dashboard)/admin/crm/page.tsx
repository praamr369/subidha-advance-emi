"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminCrmPartyRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getCrmOverview, type CrmOverviewResponse } from "@/services/crm";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load CRM overview.";
}

export default function AdminCrmOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<CrmOverviewResponse | null>(null);

  async function loadPage() {
    try {
      setLoading(true);
      const next = await getCrmOverview();
      setPayload(next);
      setError(null);
    } catch (err) {
      setPayload(null);
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  return (
    <PortalPage
      title="CRM Control Center"
      subtitle="Keep lead, customer, vendor, partner, and staff continuity in one additive party directory without replacing the underlying operational source records."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "CRM" },
      ]}
      actions={[
        { href: ROUTES.admin.crmLeads, label: "Lead Register", variant: "secondary" },
        { href: ROUTES.admin.crmParties, label: "Party Directory", variant: "primary" },
        { href: ROUTES.admin.leads, label: "Lead Triage", variant: "secondary" },
      ]}
      stats={[
        { label: "Parties", value: String(payload?.summary.party_count ?? 0), tone: "info" },
        { label: "Leads", value: String(payload?.summary.lead_count ?? 0) },
        {
          label: "Due Follow-Ups",
          value: String(payload?.summary.due_follow_up_count ?? 0),
          tone: (payload?.summary.due_follow_up_count ?? 0) > 0 ? "warning" : "success",
        },
        {
          label: "Open Interactions",
          value: String(payload?.summary.open_interaction_count ?? 0),
          tone: "info",
        },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading CRM overview..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load CRM overview"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && payload ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Customers"
                value={String(payload.summary.customer_count)}
                subtext="Parties already linked to real customer records."
                tone="success"
              />
              <StatCard
                label="Partners"
                value={String(payload.summary.partner_count)}
                subtext="Partner identities linked additively into the party directory."
                tone="info"
              />
              <StatCard
                label="Vendors"
                value={String(payload.summary.vendor_count)}
                subtext="Supplier continuity for procurement and expense workflows."
                tone="default"
              />
              <StatCard
                label="Staff"
                value={String(payload.summary.staff_count)}
                subtext="Workforce records linked without changing payroll truth."
                tone="default"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <WorkspaceSection
                title="Lead Pipeline"
                description="The CRM overview mirrors the live lead queue and conversion posture without replacing the existing lead workflow."
                actionHref={ROUTES.admin.crmLeads}
                actionLabel="Open Lead Register"
              >
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ["New", payload.lead_pipeline.new],
                    ["In Progress", payload.lead_pipeline.in_progress],
                    ["Contacted", payload.lead_pipeline.contacted],
                    ["Converted", payload.lead_pipeline.converted],
                    ["Closed", payload.lead_pipeline.closed],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/75 bg-white/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-foreground">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {payload.recent_leads.length === 0 ? (
                    <EmptyState
                      title="No recent leads"
                      description="Public or admin-created leads will appear here once they enter the queue."
                    />
                  ) : (
                    payload.recent_leads.map((lead) => (
                      <Link
                        key={lead.id}
                        href={`${ROUTES.admin.leads}/${lead.id}`}
                        className="flex items-start justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
                      >
                        <div>
                          <div className="font-medium text-foreground">{lead.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {lead.phone} · {lead.city || "No city"}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {lead.product_name || "Free-text product context"} · {lead.status}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(lead.created_at)}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Follow-Up Queue"
                description="Open interactions stay separate from finance and subscription truth, but they are visible alongside the related party."
                actionHref={ROUTES.admin.crmParties}
                actionLabel="Open Party Directory"
              >
                <div className="space-y-3">
                  {payload.follow_up_queue.length === 0 ? (
                    <EmptyState
                      title="No follow-ups due"
                      description="Open CRM follow-up items will appear here when the team records them."
                    />
                  ) : (
                    payload.follow_up_queue.map((item) => (
                      <Link
                        key={item.id}
                        href={buildAdminCrmPartyRoute(item.party_id)}
                        className="block rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium text-foreground">
                              {item.party_display_name}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {item.party_no} · {item.subject || item.interaction_type}
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{item.status}</div>
                            <div>{formatDateTime(item.next_follow_up_at || item.happened_at)}</div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </WorkspaceSection>
            </div>

            <WorkspaceSection
              title="Recent Parties"
              description="The directory links source-specific records together without merging or replacing the original customer, vendor, partner, or staff tables."
              actionHref={ROUTES.admin.crmParties}
              actionLabel="Open Directory"
            >
              <div className="grid gap-3 md:grid-cols-2">
                {payload.recent_parties.length === 0 ? (
                  <EmptyState
                    title="No party records yet"
                    description="CRM party records will appear here once a lead or role profile syncs into the directory."
                  />
                ) : (
                  payload.recent_parties.map((party) => (
                    <Link
                      key={party.id}
                      href={buildAdminCrmPartyRoute(party.id)}
                      className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 transition hover:-translate-y-0.5 hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-foreground">{party.display_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {party.party_no} · {party.role_types.join(", ") || "Unlinked"}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>{party.follow_up_state}</div>
                          <div>{party.open_follow_up_count} open</div>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </WorkspaceSection>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
