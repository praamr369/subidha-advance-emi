"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import AmendmentSafetyNotice from "@/components/amendments/SafetyNotice";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import ActionButton from "@/components/ui/ActionButton";
import { DetailPanel, MetricStrip } from "@/components/ui/operations";
import { AMENDMENT_STATUSES, amendmentContractTypeLabel, amendmentTypeLabel, listAdminAmendments, listPartnerAmendments, type AmendmentRecord } from "@/services/amendments";

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function sourceLabel(row: AmendmentRecord) {
  return row.contract_type === "RENT_LEASE"
    ? row.rent_lease_contract_number || `Contract #${row.rent_lease_contract ?? "—"}`
    : row.subscription_number || `Subscription #${row.subscription ?? "—"}`;
}

export default function PartnerAmendmentList() {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listPartnerAmendments());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <ERPPageShell eyebrow="Partner amendments" title="Customer amendment requests" subtitle="Partner-scoped amendment register." breadcrumbs={[{ label: "Partner", href: "/partner" }, { label: "Amendments" }]} actions={[{ href: "/partner/contract-amendments/new", label: "New request", variant: "primary" }]} statusBadge={{ label: "Partner scope", tone: "info" }}>
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        {loading ? <ERPLoadingState label="Loading amendment requests..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load amendments" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? <ERPEmptyState title="No amendment requests" description="No linked amendment requests are available." /> : null}
        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Amendment register" description="Only linked customer contract requests are shown.">
            <div className="grid gap-3">
              {rows.map((row) => (
                <Link key={row.id} href={`/partner/contract-amendments/${row.id}`} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.customer_name || "Customer"} · {amendmentContractTypeLabel(row.contract_type)}</div>
                    </div>
                    <ERPStatusBadge status={row.status} />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">{amendmentTypeLabel(row.amendment_type)} · {row.reason}</div>
                </Link>
              ))}
            </div>
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}

export function AdminAmendmentList({ status = "", contractType = "" }: { status?: string; contractType?: string }) {
  const [rows, setRows] = useState<AmendmentRecord[]>([]);
  const [statusInput, setStatusInput] = useState(status);
  const [typeInput, setTypeInput] = useState(contractType);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await listAdminAmendments({ status: status || undefined, contractType: contractType || undefined }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load amendment register.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setStatusInput(status); setTypeInput(contractType); void load(); }, [status, contractType]);

  const href = () => {
    const params = new URLSearchParams();
    if (statusInput) params.set("status", statusInput);
    if (typeInput) params.set("contract_type", typeInput);
    const query = params.toString();
    return query ? `/admin/contract-amendments?${query}` : "/admin/contract-amendments";
  };

  return (
    <ERPPageShell eyebrow="Admin amendments" title="Contract Amendments" subtitle="Admin review register for customer and partner amendment requests." breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Amendments" }]} statusBadge={{ label: "Decision only", tone: "warning" }}>
      <div className="space-y-5">
        <AmendmentSafetyNotice />
        <MetricStrip items={[{ label: "Total", value: String(rows.length) }, { label: "Requested", value: String(rows.filter((r) => r.status === "REQUESTED").length) }, { label: "Under review", value: String(rows.filter((r) => r.status === "UNDER_REVIEW").length) }, { label: "Approved", value: String(rows.filter((r) => r.status === "APPROVED").length) }, { label: "Rejected", value: String(rows.filter((r) => r.status === "REJECTED").length) }]} />
        <DetailPanel title="Filters" description="Filter amendment requests without changing source contracts.">
          <div className="grid gap-3 md:grid-cols-[220px_220px_auto]">
            <select className="h-11 rounded-xl border border-border bg-background px-3" value={statusInput} onChange={(event) => setStatusInput(event.target.value)}>
              <option value="">All statuses</option>
              {AMENDMENT_STATUSES.map((row) => <option key={row} value={row}>{row}</option>)}
            </select>
            <select className="h-11 rounded-xl border border-border bg-background px-3" value={typeInput} onChange={(event) => setTypeInput(event.target.value)}>
              <option value="">All contract types</option>
              <option value="EMI_SUBSCRIPTION">EMI Subscription</option>
              <option value="RENT_LEASE">Rent / Lease</option>
            </select>
            <div className="flex flex-wrap gap-2"><ActionButton href={href()}>Apply</ActionButton><ActionButton href="/admin/contract-amendments" variant="outline">Clear</ActionButton></div>
          </div>
        </DetailPanel>
        {loading ? <ERPLoadingState label="Loading amendment register..." /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load amendments" description={error} onRetry={() => void load()} /> : null}
        {!loading && !error && rows.length === 0 ? <ERPEmptyState title="No amendments found" description="No amendment requests match the current filters." /> : null}
        {!loading && !error && rows.length > 0 ? (
          <DetailPanel title="Amendment register" description="Open a request to review, approve, or reject.">
            <div className="grid gap-3">
              {rows.map((row) => (
                <Link key={row.id} href={`/admin/contract-amendments/${row.id}`} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50">
                  <div className="flex flex-wrap justify-between gap-3"><div><div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div><div className="mt-1 text-xs text-muted-foreground">{row.customer_name || "Customer"} · {sourceLabel(row)}</div></div><ERPStatusBadge status={row.status} /></div>
                  <div className="mt-3 grid gap-2 text-sm md:grid-cols-4"><span>{amendmentContractTypeLabel(row.contract_type)}</span><span>{amendmentTypeLabel(row.amendment_type)}</span><span>{row.requested_role}</span><span>{dateLabel(row.created_at)}</span></div>
                </Link>
              ))}
            </div>
          </DetailPanel>
        ) : null}
      </div>
    </ERPPageShell>
  );
}
