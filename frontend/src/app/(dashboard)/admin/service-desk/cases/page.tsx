"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { buildAdminServiceDeskCaseRoute } from "@/lib/route-builders";
import { getServiceDeskOverview, listServiceDeskCases, type ServiceDeskCase, type ServiceDeskCaseStatus, type ServiceDeskCaseType } from "@/services/service-desk";

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString("en-IN");
}

function toneClass(value: string): string {
  if (["OPEN", "UNDER_REVIEW", "AUTHORIZED", "IN_SERVICE"].includes(value)) return "border-amber-200 bg-amber-50 text-amber-900";
  if (["RESOLVED", "CLOSED"].includes(value)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["REJECTED", "CANCELLED"].includes(value)) return "border-border bg-muted/50 text-muted-foreground";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

function caseTypeLabel(value: ServiceDeskCaseType): string {
  return value.replaceAll("_", " ");
}

export default function AdminServiceDeskCasesPage() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getServiceDeskOverview>> | null>(null);
  const [rows, setRows] = useState<ServiceDeskCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [caseType, setCaseType] = useState<ServiceDeskCaseType | "ALL">("ALL");
  const [status, setStatus] = useState<ServiceDeskCaseStatus | "ALL">("ALL");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const [overviewPayload, casesPayload] = await Promise.all([
          getServiceDeskOverview(),
          listServiceDeskCases({
            q: q.trim() || undefined,
            case_type: caseType === "ALL" ? undefined : caseType,
            status: status === "ALL" ? undefined : status,
            page_size: 100,
          }),
        ]);
        if (!active) return;
        setOverview(overviewPayload);
        setRows(casesPayload.results);
        setError(null);
      } catch (err) {
        if (!active) return;
        setOverview(null);
        setRows([]);
        setError(err instanceof Error ? err.message : "Failed to load service desk cases.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [caseType, q, status]);

  const summaryCards = useMemo(
    () => [
      { label: "Cases", value: overview?.summary.case_count ?? 0 },
      { label: "Open queue", value: overview?.summary.open_count ?? 0 },
      { label: "Returns", value: overview?.summary.returns_count ?? 0 },
      { label: "Complaints", value: overview?.summary.complaint_case_count ?? 0 },
      { label: "Service", value: overview?.summary.service_count ?? 0 },
      { label: "Finance pending", value: overview?.summary.finance_pending_count ?? 0 },
      { label: "Stock pending", value: overview?.summary.stock_pending_count ?? 0 },
    ],
    [overview]
  );

  return (
    <ERPPageShell
      eyebrow="Service Desk"
      title="Service Desk Cases"
      subtitle="Canonical case register for returns, complaints, exchanges, and after-sales service."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Service Desk", href: ROUTES.admin.serviceDesk },
        { label: "Cases" },
      ]}
      actions={[
        { href: ROUTES.admin.serviceDesk, label: "Service Desk Overview", variant: "primary" },
        { href: ROUTES.admin.serviceDeskComplaints, label: "Complaints", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskReturns, label: "Returns", variant: "secondary" },
        { href: ROUTES.admin.serviceDeskTickets, label: "Service Tickets", variant: "secondary" },
      ]}
    >
      <div className="space-y-6">
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{card.value}</div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm font-medium text-foreground">
              Search
              <input
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                placeholder="Case number, issue, party, or reference"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </label>
            <label className="block text-sm font-medium text-foreground">
              Case type
              <select
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={caseType}
                onChange={(event) => setCaseType(event.target.value as ServiceDeskCaseType | "ALL")}
              >
                <option value="ALL">All types</option>
                <option value="COMPLAINT">Complaint</option>
                <option value="SALES_RETURN">Sales return</option>
                <option value="DELIVERY_RETURN">Delivery return</option>
                <option value="EXCHANGE">Exchange</option>
                <option value="SERVICE">Service</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-foreground">
              Status
              <select
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value as ServiceDeskCaseStatus | "ALL")}
              >
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="UNDER_REVIEW">Under review</option>
                <option value="AUTHORIZED">Authorized</option>
                <option value="IN_SERVICE">In service</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
          </div>
        </section>

        {loading ? <LoadingBlock label="Loading service desk cases..." /> : null}
        {!loading && error ? <ErrorState title="Unable to load cases" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            title="No cases found"
            description="Cases will appear here once complaints, returns, exchanges, or service tasks are opened."
          />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Party / Source</th>
                  <th className="px-4 py-3">Finance / Stock</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="bg-background">
                    <td className="px-4 py-3">
                      <Link href={buildAdminServiceDeskCaseRoute(row.id)} className="font-semibold text-primary underline-offset-2 hover:underline">
                        {row.case_no}
                      </Link>
                      <div className="text-xs text-muted-foreground">{row.issue_summary}</div>
                    </td>
                    <td className="px-4 py-3">{caseTypeLabel(row.case_type)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.party_display_name || row.reporter_name_snapshot || "—"}</div>
                      <div className="text-xs text-muted-foreground">{row.party_no || row.reporter_phone_snapshot || row.support_request_status || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-muted-foreground">Finance: {row.finance_status}</div>
                      <div className="text-xs text-muted-foreground">Stock: {row.stock_status}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateTime(row.updated_at || row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
