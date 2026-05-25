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
import { AMENDMENT_STATUSES, amendmentContractTypeLabel, amendmentTypeLabel, approveAdminAmendment, getAdminAmendment, listAdminAmendments, listPartnerAmendments, rejectAdminAmendment, reviewAdminAmendment, type AmendmentRecord } from "@/services/amendments";

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

function safeJson(value?: Record<string, unknown> | null) {
  return JSON.stringify(value && Object.keys(value).length > 0 ? value : {}, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Approved values must be a JSON object.");
  return parsed as Record<string, unknown>;
}

function Timeline({ status }: { status: string }) {
  return <div className="grid gap-2 md:grid-cols-4">{["REQUESTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].map((step) => <div key={step} className={`rounded-2xl border p-3 text-sm ${step === status ? "border-primary bg-primary/10" : "border-border bg-muted/20"}`}><div className="font-semibold">{step.replace(/_/g, " ")}</div><div className="mt-1 text-xs text-muted-foreground">{step === status ? "Current state" : "Workflow step"}</div></div>)}</div>;
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
                  <div className="flex flex-wrap justify-between gap-3"><div><div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div><div className="mt-1 text-xs text-muted-foreground">{row.customer_name || "Customer"} · {amendmentContractTypeLabel(row.contract_type)}</div></div><ERPStatusBadge status={row.status} /></div>
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
      <div className="space-y-5"><AmendmentSafetyNotice /><MetricStrip items={[{ label: "Total", value: String(rows.length) }, { label: "Requested", value: String(rows.filter((r) => r.status === "REQUESTED").length) }, { label: "Under review", value: String(rows.filter((r) => r.status === "UNDER_REVIEW").length) }, { label: "Approved", value: String(rows.filter((r) => r.status === "APPROVED").length) }, { label: "Rejected", value: String(rows.filter((r) => r.status === "REJECTED").length) }]} />
        <DetailPanel title="Filters" description="Filter amendment requests without changing source contracts."><div className="grid gap-3 md:grid-cols-[220px_220px_auto]"><select className="h-11 rounded-xl border border-border bg-background px-3" value={statusInput} onChange={(event) => setStatusInput(event.target.value)}><option value="">All statuses</option>{AMENDMENT_STATUSES.map((row) => <option key={row} value={row}>{row}</option>)}</select><select className="h-11 rounded-xl border border-border bg-background px-3" value={typeInput} onChange={(event) => setTypeInput(event.target.value)}><option value="">All contract types</option><option value="EMI_SUBSCRIPTION">EMI Subscription</option><option value="RENT_LEASE">Rent / Lease</option></select><div className="flex flex-wrap gap-2"><ActionButton href={href()}>Apply</ActionButton><ActionButton href="/admin/contract-amendments" variant="outline">Clear</ActionButton></div></div></DetailPanel>
        {loading ? <ERPLoadingState label="Loading amendment register..." /> : null}{!loading && error ? <ERPErrorState title="Unable to load amendments" description={error} onRetry={() => void load()} /> : null}{!loading && !error && rows.length === 0 ? <ERPEmptyState title="No amendments found" description="No amendment requests match the current filters." /> : null}
        {!loading && !error && rows.length > 0 ? <DetailPanel title="Amendment register" description="Open a request to review, approve, or reject."><div className="grid gap-3">{rows.map((row) => <Link key={row.id} href={`/admin/contract-amendments/${row.id}`} className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50"><div className="flex flex-wrap justify-between gap-3"><div><div className="font-semibold">{row.amendment_no || `AMD-${row.id}`}</div><div className="mt-1 text-xs text-muted-foreground">{row.customer_name || "Customer"} · {sourceLabel(row)}</div></div><ERPStatusBadge status={row.status} /></div><div className="mt-3 grid gap-2 text-sm md:grid-cols-4"><span>{amendmentContractTypeLabel(row.contract_type)}</span><span>{amendmentTypeLabel(row.amendment_type)}</span><span>{row.requested_role}</span><span>{dateLabel(row.created_at)}</span></div></Link>)}</div></DetailPanel> : null}
      </div>
    </ERPPageShell>
  );
}

export function AdminAmendmentDetail({ id }: { id: number }) {
  const [row, setRow] = useState<AmendmentRecord | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [approvedJson, setApprovedJson] = useState("{}\n");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const next = await getAdminAmendment(id);
      setRow(next);
      setAdminNote(next.admin_note || "");
      setApprovedJson(safeJson(next.approved_values && Object.keys(next.approved_values).length > 0 ? next.approved_values : next.requested_values || next.new_values));
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load amendment."); } finally { setLoading(false); }
  }

  useEffect(() => { if (Number.isFinite(id)) void load(); }, [id]);

  async function run(action: "review" | "approve" | "reject") {
    setBusy(action); setError(null);
    try {
      if (action === "review") setRow(await reviewAdminAmendment(id, adminNote));
      if (action === "approve") setRow(await approveAdminAmendment(id, { approved_values: parseJsonObject(approvedJson), admin_note: adminNote }));
      if (action === "reject") {
        if (!rejectionReason.trim()) throw new Error("Rejection reason is required.");
        setRow(await rejectAdminAmendment(id, { rejection_reason: rejectionReason.trim(), admin_note: adminNote }));
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Action failed."); } finally { setBusy(null); }
  }

  return (
    <ERPPageShell eyebrow="Admin amendment review" title={row?.amendment_no || `Amendment #${id}`} subtitle="Review, approve, or reject only. No implementation action is available." breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Contract Amendments", href: "/admin/contract-amendments" }, { label: row?.amendment_no || `#${id}` }]} statusBadge={{ label: "No implement button", tone: "warning" }}>
      <div className="space-y-5"><AmendmentSafetyNotice />{loading ? <ERPLoadingState label="Loading amendment..." /> : null}{!loading && error ? <ERPErrorState title="Amendment action failed" description={error} onRetry={() => void load()} /> : null}
        {!loading && row ? <><DetailPanel title="Status timeline" description="Workflow stops at admin decision in this phase."><Timeline status={row.status} /></DetailPanel><div className="grid gap-4 lg:grid-cols-2"><DetailPanel title="Request summary" description="Requester and contract context."><dl className="grid gap-3 text-sm"><div><dt className="text-muted-foreground">Status</dt><dd><ERPStatusBadge status={row.status} /></dd></div><div><dt className="text-muted-foreground">Customer</dt><dd>{row.customer_name || "—"}</dd></div><div><dt className="text-muted-foreground">Contract</dt><dd>{amendmentContractTypeLabel(row.contract_type)} · {sourceLabel(row)}</dd></div><div><dt className="text-muted-foreground">Type</dt><dd>{amendmentTypeLabel(row.amendment_type)}</dd></div><div><dt className="text-muted-foreground">Requester</dt><dd>{row.requested_by_username || row.requested_role} · {row.requested_role}</dd></div></dl></DetailPanel><DetailPanel title="Request reason" description="Submitted reason."><p className="text-sm text-muted-foreground">{row.reason}</p></DetailPanel></div><div className="grid gap-4 lg:grid-cols-3"><DetailPanel title="Old values" description="Source snapshot."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.old_values || row.previous_values)}</pre></DetailPanel><DetailPanel title="Requested values" description="Requested change."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.requested_values || row.new_values)}</pre></DetailPanel><DetailPanel title="Approved values" description="Decision values."><pre className="max-h-80 overflow-auto rounded-xl bg-muted p-3 text-xs">{safeJson(row.approved_values)}</pre></DetailPanel></div><DetailPanel title="Admin decision controls" description="Review, approve, or reject only."><label className="block text-sm font-medium">Admin note<textarea className="mt-2 min-h-24 w-full rounded-xl border border-border bg-background p-3 text-sm" value={adminNote} onChange={(event) => setAdminNote(event.target.value)} /></label><label className="mt-4 block text-sm font-medium">Approved values JSON<textarea className="mt-2 min-h-32 w-full rounded-xl border border-border bg-background p-3 font-mono text-sm" value={approvedJson} onChange={(event) => setApprovedJson(event.target.value)} /></label><label className="mt-4 block text-sm font-medium">Rejection reason<input className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} placeholder="Required for rejection" /></label><div className="mt-4 flex flex-wrap gap-3"><ActionButton onClick={() => void run("review")} disabled={Boolean(busy) || row.status !== "REQUESTED"}>{busy === "review" ? "Reviewing..." : "Mark under review"}</ActionButton><ActionButton onClick={() => void run("approve")} disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}>{busy === "approve" ? "Approving..." : "Approve decision only"}</ActionButton><ActionButton variant="outline" onClick={() => void run("reject")} disabled={Boolean(busy) || !["REQUESTED", "UNDER_REVIEW"].includes(row.status)}>{busy === "reject" ? "Rejecting..." : "Reject"}</ActionButton></div></DetailPanel></> : null}
      </div>
    </ERPPageShell>
  );
}
