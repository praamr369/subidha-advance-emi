"use client";

import Link from "next/link";
import { MessageSquareWarning, RotateCcw, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import PortalPage from "@/components/ui/PortalPage";
import StatCard from "@/components/ui/StatCard";
import { WorkspaceSection } from "@/components/ui/workspace";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getServiceDeskOverview, type ServiceDeskOverview } from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Unable to load the service desk overview.";
}

export default function AdminServiceDeskOverviewPage() {
  const [payload, setPayload] = useState<ServiceDeskOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadPage() {
    try {
      setLoading(true);
      const next = await getServiceDeskOverview();
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
      title="Service Desk"
      subtitle="Run complaint escalation, furniture returns, exchanges, and after-sales service through explicit operational cases that link back to CRM, delivery, billing, inventory, and accounting without mutating those records directly."
      helperNote="Case actions are orchestrated through linked modules so complaint, return, stock, and finance posture remain traceable."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDeskComplaints, label: "Complaints", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Returns", variant: "primary" },
        { href: ROUTES.admin.serviceDeskTickets, label: "Service Tickets", variant: "secondary" },
      ]}
      stats={[
        { label: "Cases", value: String(payload?.summary.case_count ?? 0), tone: "info" },
        {
          label: "Open Queue",
          value: String(payload?.summary.open_count ?? 0),
          tone: (payload?.summary.open_count ?? 0) > 0 ? "warning" : "success",
        },
        { label: "Returns", value: String(payload?.summary.returns_count ?? 0) },
        { label: "Service", value: String(payload?.summary.service_count ?? 0) },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" }}
    >
      <div className="space-y-6">
        {loading ? <LoadingBlock label="Loading service desk overview..." /> : null}
        {!loading && error ? (
          <ErrorState
            title="Unable to load the service desk overview"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        {!loading && !error && payload ? (
          <>
            <ControlLaneGrid
              title="Service control lanes"
              description="Complaint intake, return handling, and service execution stay as explicit case lanes linked back to support, billing, and delivery records."
              lanes={[
                {
                  title: "Complaint lane",
                  description: "Handle complaint-linked cases and intake review.",
                  href: ROUTES.admin.serviceDeskComplaints,
                  icon: <MessageSquareWarning className="h-4 w-4" />,
                  badge: "Complaint",
                },
                {
                  title: "Return lane",
                  description: "Run returns and exchange posture through explicit case tracking.",
                  href: ROUTES.admin.serviceDeskReturns,
                  icon: <RotateCcw className="h-4 w-4" />,
                  badge: "Returns",
                },
                {
                  title: "Service ticket lane",
                  description: "After-sales service tickets and work execution remain route-safe and auditable.",
                  href: ROUTES.admin.serviceDeskTickets,
                  icon: <Wrench className="h-4 w-4" />,
                  badge: "Service",
                },
              ]}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Finance Pending"
                value={String(payload.summary.finance_pending_count)}
                subtext="Cases still waiting on credit or debit note posting."
                tone={payload.summary.finance_pending_count > 0 ? "warning" : "success"}
              />
              <StatCard
                label="Stock Pending"
                value={String(payload.summary.stock_pending_count)}
                subtext="Cases still waiting on explicit stock or delivery return settlement."
                tone={payload.summary.stock_pending_count > 0 ? "warning" : "success"}
              />
              <StatCard
                label="Complaints"
                value={String(payload.summary.support_request_count)}
                subtext="Customer complaint intake remains visible without replacing support truth."
                tone="info"
              />
              <StatCard
                label="Open Complaints"
                value={String(payload.summary.open_support_request_count)}
                subtext="Complaint requests still waiting on review or resolution."
                tone={payload.summary.open_support_request_count > 0 ? "warning" : "default"}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <WorkspaceSection
                title="Recent Service Cases"
                description="Returns, exchanges, and after-sales service tickets stay as explicit cases with drill-downs into the linked operational records."
                actionHref={ROUTES.admin.serviceDeskReturns}
                actionLabel="Open Return Register"
              >
                <div className="space-y-3">
                  {payload.recent_cases.length === 0 ? (
                    <EmptyState
                      title="No service cases yet"
                      description="Once the team starts logging returns, exchanges, or service tickets, they will appear here."
                    />
                  ) : (
                    payload.recent_cases.map((item) => (
                      <Link
                        key={item.id}
                        href={buildAdminServiceDeskCaseRoute(item.id)}
                        className="block rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium text-foreground">
                              {item.case_no} · {item.issue_summary}
                            </div>
                            <div className="text-sm text-slate-600">
                              {item.case_type} · {item.status}
                              {item.billing_invoice_no ? ` · ${item.billing_invoice_no}` : ""}
                              {item.delivery_reference ? ` · ${item.delivery_reference}` : ""}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-600">
                            <div>{item.finance_status}</div>
                            <div>{formatDateTime(item.created_at)}</div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </WorkspaceSection>

              <WorkspaceSection
                title="Recent Complaint Intake"
                description="Complaints remain anchored in the support-request flow, but linked service-desk cases now keep escalation, return, and service work auditable."
                actionHref={ROUTES.admin.serviceDeskComplaints}
                actionLabel="Open Complaint Register"
              >
                <div className="space-y-3">
                  {payload.recent_complaints.length === 0 ? (
                    <EmptyState
                      title="No complaint intake"
                      description="Customer complaints or support requests will appear here once they are submitted."
                    />
                  ) : (
                    payload.recent_complaints.map((item) => (
                      <Link
                        key={item.id}
                        href={
                          item.linked_service_case_id
                            ? buildAdminServiceDeskCaseRoute(item.linked_service_case_id)
                            : ROUTES.admin.supportRequests
                        }
                        className="block rounded-2xl border border-border bg-[var(--surface-card-elevated)] px-4 py-3 transition hover:-translate-y-0.5 hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="font-medium text-foreground">
                              Complaint #{item.id} · {item.customer_name || "Customer"}
                            </div>
                            <div className="text-sm text-slate-600">
                              {item.category} · {item.status}
                              {item.linked_service_case_no
                                ? ` · ${item.linked_service_case_no}`
                                : " · No case linked yet"}
                            </div>
                          </div>
                          <div className="text-right text-xs text-slate-600">
                            <div>{item.linked_service_case_status || "Support only"}</div>
                            <div>{formatDateTime(item.created_at)}</div>
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </WorkspaceSection>
            </div>
          </>
        ) : null}
      </div>
    </PortalPage>
  );
}
