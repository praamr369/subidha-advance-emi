"use client";

import Link from "next/link";
import { MessageSquareWarning, RotateCcw, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ControlLaneGrid } from "@/components/admin/control-center/ControlLanes";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import StatCard from "@/components/ui/StatCard";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import { ROUTES } from "@/lib/routes";
import { getServiceDeskOverview, type ServiceDeskOverview } from "@/services/service-desk";
import { listAdminSupportTickets, type SupportDashboardSummary, type SupportTicketListItem } from "@/services/support";

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
  const [issueTickets, setIssueTickets] = useState<SupportTicketListItem[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [issueSummary, setIssueSummary] = useState<SupportDashboardSummary | null>(null);
  const [issueLoading, setIssueLoading] = useState(true);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issueQ, setIssueQ] = useState("");
  const [issueLane, setIssueLane] = useState<
    "OPEN" | "WAITING_FOR_CUSTOMER" | "RESOLVED" | "WAITING_FOR_INTERNAL_ACTION"
  >("OPEN");

  const filteredIssueTickets = useMemo(() => {
    const q = issueQ.trim().toLowerCase();
    if (!q) return issueTickets;
    return issueTickets.filter(
      (row) =>
        row.ticket_no.toLowerCase().includes(q) ||
        row.subject.toLowerCase().includes(q) ||
        String(row.id) === q
    );
  }, [issueTickets, issueQ]);

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

  const loadIssues = useCallback(async (lane: typeof issueLane = issueLane) => {
    setIssueLoading(true);
    try {
      const data = await listAdminSupportTickets({ status: lane });
      setIssueTickets(data.results);
      setIssueCount(data.count);
      setIssueSummary(data.summary);
      setIssueError(null);
    } catch (err) {
      setIssueTickets([]);
      setIssueCount(0);
      setIssueSummary(null);
      setIssueError(
        err instanceof Error && err.message.trim() ? err.message : "Unable to load issue tickets."
      );
    } finally {
      setIssueLoading(false);
    }
  }, [issueLane]);

  useEffect(() => {
    void loadIssues(issueLane);
  }, [issueLane, loadIssues]);

  return (
    <ERPPageShell
      eyebrow="Service Operations"
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
      headerMode="erp"
    >
      <div className="space-y-6">
        {loading ? <ERPLoadingState label="Loading service desk overview..." /> : null}
        {!loading && error ? (
          <ERPErrorState
            title="Unable to load the service desk overview"
            description={error}
            onRetry={() => void loadPage()}
          />
        ) : null}

        <ERPSectionShell
          title="Customer issue tickets (TKT)"
          description="Unified support desk for EMI, rent, lease, delivery, and billing questions. Links are read-only references; no payment or EMI posting happens here."
        >
          {issueLoading ? <ERPLoadingState label="Loading issue tickets…" /> : null}
          {!issueLoading && issueError ? (
            <ERPErrorState title="Issue queue error" description={issueError} onRetry={() => void loadIssues()} />
          ) : null}
          {!issueLoading && !issueError ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <nav aria-label="Issue ticket queues" className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "OPEN", label: "Open", helper: "New tickets awaiting action." },
                      { key: "WAITING_FOR_CUSTOMER", label: "Pending customer", helper: "Waiting for customer reply." },
                      { key: "RESOLVED", label: "Resolved", helper: "Resolved by staff (read-only)." },
                      { key: "WAITING_FOR_INTERNAL_ACTION", label: "Escalated", helper: "Internal action required." },
                    ] as const
                  ).map((lane) => {
                    const count = issueSummary?.by_status?.[lane.key] ?? 0;
                    const active = issueLane === lane.key;
                    return (
                      <button
                        key={lane.key}
                        type="button"
                        onClick={() => {
                          setIssueLane(lane.key);
                          void loadIssues(lane.key);
                        }}
                        className={[
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                          active
                            ? "border-primary/60 bg-primary text-primary-foreground"
                            : "border-border bg-[var(--surface-strong)] text-foreground hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)]",
                        ].join(" ")}
                        title={lane.helper}
                      >
                        <span>{lane.label}</span>
                        <span className={active ? "text-primary-foreground/90 tabular-nums" : "text-muted-foreground tabular-nums"}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Open (total)"
                    value={String(issueSummary?.open ?? 0)}
                    subtext="Across all non-terminal states."
                    tone={(issueSummary?.open ?? 0) > 0 ? "warning" : "success"}
                  />
                  <StatCard
                    label="Visible (lane)"
                    value={String(issueCount)}
                    subtext="Matches the selected lane."
                    tone="info"
                  />
                  <div className="flex flex-col justify-end gap-2">
                    <label className="text-xs text-muted-foreground">
                      Search subject / ticket / phone
                      <input
                        className="mt-1 w-full rounded-lg border border-border bg-[var(--surface-card)] px-2 py-1 text-sm"
                        value={issueQ}
                        onChange={(e) => setIssueQ(e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>
              {issueTickets.length === 0 ? (
                <ERPEmptyState
                  title="No tickets"
                  description="Customer submissions will appear here with TKT-FY-##### numbers."
                />
              ) : filteredIssueTickets.length === 0 ? (
                <ERPEmptyState
                  title="No matches"
                  description="Try a different search on the loaded page of tickets."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[var(--surface-muted)] text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Ticket</th>
                        <th className="px-3 py-2">Subject</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Priority</th>
                        <th className="px-3 py-2">Age</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIssueTickets.map((row) => {
                        const created = Date.parse(row.created_at);
                        const ageDays =
                          Number.isFinite(created) && !Number.isNaN(created)
                            ? Math.max(0, Math.round((Date.now() - created) / 86400000))
                            : null;
                        return (
                          <tr key={row.id} className="border-t border-border">
                            <td className="px-3 py-2 font-mono text-xs">{row.ticket_no}</td>
                            <td className="px-3 py-2">{row.subject}</td>
                            <td className="px-3 py-2">
                              <ERPStatusBadge status={row.status} hideIcon />
                            </td>
                            <td className="px-3 py-2 text-xs">{row.priority}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {ageDays === null ? "—" : `${ageDays}d`}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <Link
                                href={`/admin/service-desk/${row.id}`}
                                className="text-primary underline-offset-2 hover:underline"
                              >
                                Open
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </ERPSectionShell>

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
            <WorkspaceDirectory
              title="Service route map"
              description="Use the service desk as the operational queue, then move into the exact complaint, return, service, billing, or support route that owns the next action."
              groups={[
                {
                  title: "Case execution",
                  description: "Primary lanes for service-desk case work.",
                  items: [
                    {
                      title: "Complaints",
                      description: "Complaint-linked case register for review and escalation.",
                      href: ROUTES.admin.serviceDeskComplaints,
                      icon: <MessageSquareWarning className="h-4 w-4" />,
                      badge: "Complaint",
                    },
                    {
                      title: "Returns",
                      description: "Return and exchange case handling with stock-linked follow-up.",
                      href: ROUTES.admin.serviceDeskReturns,
                      icon: <RotateCcw className="h-4 w-4" />,
                      badge: "Returns",
                    },
                    {
                      title: "Service Tickets",
                      description: "After-sales service work orders and technician-facing case execution.",
                      href: ROUTES.admin.serviceDeskTickets,
                      icon: <Wrench className="h-4 w-4" />,
                      badge: "Service",
                    },
                  ],
                },
                {
                  title: "Linked operational context",
                  description: "Adjacent routes that provide the source and financial context for case work.",
                  items: [
                    {
                      title: "Support Requests",
                      description: "Customer issue intake before or alongside service-case escalation.",
                      href: ROUTES.admin.supportRequests,
                      icon: <MessageSquareWarning className="h-4 w-4" />,
                      badge: "Intake",
                    },
                    {
                      title: "Billing Operations",
                      description: "Invoice and adjustment context for return and exchange cases.",
                      href: ROUTES.admin.billing,
                      icon: <RotateCcw className="h-4 w-4" />,
                      badge: "Billing",
                    },
                    {
                      title: "Deliveries",
                      description: "Delivery context that often drives complaint and return follow-up.",
                      href: ROUTES.admin.deliveries,
                      icon: <Wrench className="h-4 w-4" />,
                      badge: "Delivery",
                    },
                  ],
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
              <ERPSectionShell
                title="Recent Service Cases"
                description="Returns, exchanges, and after-sales service tickets stay as explicit cases with drill-downs into the linked operational records."
                actions={
                  <Link
                    href={ROUTES.admin.serviceDeskReturns}
                    className="inline-flex h-9 items-center rounded-xl border border-border bg-[var(--surface-strong)] px-4 text-sm font-semibold shadow-[inset_0_1px_0_var(--hairline-shine)] transition hover:border-[var(--surface-border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-strong)_76%,var(--surface-muted)_24%)]"
                  >
                    Open Return Register
                  </Link>
                }
              >
                <div className="space-y-3">
                  {payload.recent_cases.length === 0 ? (
                    <ERPEmptyState
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
              </ERPSectionShell>

              <ERPSectionShell
                title="Recent Complaint Intake"
                description="Complaints remain anchored in the support-request flow, but linked service-desk cases now keep escalation, return, and service work auditable."
                actions={
                  <Link
                    href={ROUTES.admin.serviceDeskComplaints}
                    className="inline-flex h-9 items-center rounded-xl border border-border bg-[var(--surface-strong)] px-4 text-sm font-semibold shadow-[inset_0_1px_0_var(--hairline-shine)] transition hover:border-[var(--surface-border-strong)] hover:bg-[color-mix(in_oklab,var(--surface-strong)_76%,var(--surface-muted)_24%)]"
                  >
                    Open Complaint Register
                  </Link>
                }
              >
                <div className="space-y-3">
                  {payload.recent_complaints.length === 0 ? (
                    <ERPEmptyState
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
              </ERPSectionShell>
            </div>
          </>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
