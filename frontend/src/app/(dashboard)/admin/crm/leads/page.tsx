"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import {
  createInternalLead,
  getInternalCrmLeads,
  promotePublicLeadToCrm,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type InternalLeadRow,
  type LeadPlanType,
  type LeadStage,
} from "@/services/crm-module";

function formatDt(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("en-IN"); } catch { return value; }
}

const PLAN_TYPES: { value: LeadPlanType; label: string }[] = [
  { value: "LUCKY_PLAN", label: "Lucky Plan" },
  { value: "DIRECT_SALE", label: "Direct Sale" },
  { value: "RENT", label: "Rent" },
  { value: "LEASE", label: "Lease" },
];

const STAGE_BADGE: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-purple-100 text-purple-800",
  INTERESTED: "bg-yellow-100 text-yellow-800",
  KYC_PENDING: "bg-orange-100 text-orange-800",
  READY_TO_CONVERT: "bg-teal-100 text-teal-800",
  CONVERTED: "bg-green-100 text-green-800",
  LOST: "bg-gray-100 text-gray-500",
};

const SOURCES = Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({ value, label }));

type AddLeadForm = {
  name: string; phone: string; email: string; source: string;
  interested_plan_type: LeadPlanType; next_follow_up_at: string;
};
const EMPTY_FORM: AddLeadForm = {
  name: "", phone: "", email: "", source: "WALK_IN",
  interested_plan_type: "LUCKY_PLAN", next_follow_up_at: "",
};

// Minimal type for PublicLead rows returned by /admin/leads/
type PublicLeadRow = {
  id: number;
  name: string;
  phone: string;
  email?: string;
  status: string;
  source?: string;
  created_at: string;
  crm_pipeline_lead?: Array<{ id: number; stage: string }>;
};

type ActiveTab = "pipeline" | "enquiries";

export default function AdminCrmLeadRegisterPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("pipeline");

  // Pipeline state
  const [rows, setRows] = useState<InternalLeadRow[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<LeadStage | "">("");
  const [search, setSearch] = useState("");
  const [createdAfter, setCreatedAfter] = useState("");
  const [createdBefore, setCreatedBefore] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddLeadForm>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Public leads state
  const [publicLeads, setPublicLeads] = useState<PublicLeadRow[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInternalCrmLeads({
        q: search || undefined,
        stage: filterStage || undefined,
        created_after: createdAfter || undefined,
        created_before: createdBefore || undefined,
        page,
        page_size: 50,
      });
      setRows(data.results);
      setStageCounts(data.stage_counts);
      setTotalCount(data.count);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leads.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStage, createdAfter, createdBefore, page]);

  useEffect(() => { void load(); }, [load]);

  const loadPublicLeads = useCallback(async () => {
    if (publicLeads.length > 0) return;
    setPublicLoading(true);
    setPublicError(null);
    try {
      const data = await apiFetch<{ results: PublicLeadRow[] }>("/admin/leads/");
      setPublicLeads(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      setPublicError(err instanceof Error ? err.message : "Unable to load online enquiries.");
    } finally {
      setPublicLoading(false);
    }
  }, [publicLeads.length]);

  useEffect(() => {
    if (activeTab === "enquiries") void loadPublicLeads();
  }, [activeTab, loadPublicLeads]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.phone.trim()) { setAddError("Name and phone are required."); return; }
    setAddBusy(true);
    setAddError(null);
    try {
      await createInternalLead({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        source: form.source,
        interested_plan_type: form.interested_plan_type,
        next_follow_up_at: form.next_follow_up_at ? new Date(form.next_follow_up_at).toISOString() : undefined,
      });
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      setPage(1);
      await load();
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { existing_lead_id?: number; detail?: string } };
      if (e?.status === 409 && e?.body?.existing_lead_id) {
        setAddError(`Duplicate phone: lead #${e.body.existing_lead_id} already exists in the pipeline.`);
      } else {
        setAddError(err instanceof Error ? err.message : "Failed to create lead.");
      }
    } finally {
      setAddBusy(false);
    }
  };

  const handlePromote = async (publicLeadId: number) => {
    setPromotingId(publicLeadId);
    try {
      const result = await promotePublicLeadToCrm(publicLeadId);
      window.location.href = `${ROUTES.admin.crmLeads}/${result.crm_lead.id}`;
    } catch (err: unknown) {
      const e = err as { status?: number; body?: { crm_lead_id?: number } };
      if (e?.status === 409 && e?.body?.crm_lead_id) {
        window.location.href = `${ROUTES.admin.crmLeads}/${e.body.crm_lead_id}`;
      } else {
        alert(err instanceof Error ? err.message : "Promotion failed.");
      }
    } finally {
      setPromotingId(null);
    }
  };

  const totalActive = Object.entries(stageCounts)
    .filter(([s]) => s !== "CONVERTED" && s !== "LOST")
    .reduce((sum, [, c]) => sum + c, 0);

  const unreviewedPublicLeads = publicLeads.filter((pl) => !pl.crm_pipeline_lead?.length);

  return (
    <ERPPageShell
      title="CRM Leads"
      subtitle="Internal lead pipeline and online enquiry inbox."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Leads" },
      ]}
      stats={[
        { label: "Total", value: String(totalCount), tone: "info" },
        { label: "Active", value: String(totalActive), tone: "default" },
        { label: "Converted", value: String(stageCounts["CONVERTED"] || 0), tone: "success" },
        { label: "Lost", value: String(stageCounts["LOST"] || 0), tone: "warning" },
      ]}
    >
      {/* Tab bar */}
      <div className="flex gap-0 rounded-xl border border-border overflow-hidden w-fit mb-6">
        <button
          onClick={() => setActiveTab("pipeline")}
          className={`px-5 py-2 text-sm font-medium transition-colors ${activeTab === "pipeline" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          Pipeline Leads
        </button>
        <button
          onClick={() => setActiveTab("enquiries")}
          className={`px-5 py-2 text-sm font-medium transition-colors relative ${activeTab === "enquiries" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
        >
          Online Enquiries
          {unreviewedPublicLeads.length > 0 ? (
            <span className="ml-1.5 inline-block rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {unreviewedPublicLeads.length}
            </span>
          ) : null}
        </button>
      </div>

      {/* ── Pipeline tab ──────────────────────────────────── */}
      {activeTab === "pipeline" ? (
        <ERPSectionShell title="Lead register" description="Click any row to open the full detail view with follow-up tasks and opportunities.">
          {/* Toolbar */}
          <div className="mb-4 flex flex-wrap gap-3 items-center">
            <input
              type="text"
              placeholder="Search name / phone…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onKeyDown={(e) => e.key === "Enter" && void load()}
              className="h-9 w-48 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <select
              value={filterStage}
              onChange={(e) => { setFilterStage(e.target.value as LeadStage | ""); setPage(1); }}
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">All stages</option>
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>{LEAD_STAGE_LABELS[s]} ({stageCounts[s] || 0})</option>
              ))}
            </select>
            {/* Gap 10: date range filter */}
            <input
              type="date"
              value={createdAfter}
              onChange={(e) => { setCreatedAfter(e.target.value); setPage(1); }}
              title="Created after"
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <input
              type="date"
              value={createdBefore}
              onChange={(e) => { setCreatedBefore(e.target.value); setPage(1); }}
              title="Created before"
              className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
            />
            <button onClick={() => void load()} className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
              Search
            </button>
            <div className="ml-auto flex gap-2">
              <Link href={ROUTES.admin.crmPipeline} className="flex h-9 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
                Pipeline board
              </Link>
              <button
                onClick={() => { setShowAddForm((v) => !v); setAddError(null); }}
                className="flex h-9 items-center rounded-xl border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                + Add Lead
              </button>
            </div>
          </div>

          {/* Add Lead Form */}
          {showAddForm ? (
            <div className="mb-5 rounded-xl border border-border bg-card p-5">
              <div className="mb-3 text-sm font-semibold text-foreground">New Lead</div>
              {addError ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</div> : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Full name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ramesh Kumar" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Phone *</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="9876543210" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ramesh@example.com" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Lead source</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm">
                    {SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Plan interest</label>
                  <select value={form.interested_plan_type} onChange={(e) => setForm({ ...form, interested_plan_type: e.target.value as LeadPlanType })} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm">
                    {PLAN_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">First follow-up</label>
                  <input type="datetime-local" value={form.next_follow_up_at} onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })} className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button disabled={addBusy} onClick={() => void handleAdd()} className="rounded-xl border border-primary bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {addBusy ? "Saving…" : "Create Lead"}
                </button>
                <button onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); setAddError(null); }} className="rounded-xl border border-border px-5 py-2 text-sm hover:bg-muted">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Table */}
          {loading ? <ERPLoadingState label="Loading leads…" /> : null}
          {!loading && error ? <ERPErrorState title="Unable to load leads" description={error} /> : null}
          {!loading && !error && rows.length === 0 ? <ERPEmptyState title="No leads found" description="Create the first lead or adjust the search filters." /> : null}
          {!loading && !error && rows.length > 0 ? (
            <>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">Lead</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Stage</th>
                      <th className="px-4 py-3">Assigned</th>
                      <th className="px-4 py-3">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const overdue = row.next_follow_up_at && new Date(row.next_follow_up_at) <= new Date();
                      return (
                        <tr
                          key={row.id}
                          className="border-t border-border/60 hover:bg-muted/30 cursor-pointer"
                          onClick={() => (window.location.href = `${ROUTES.admin.crmLeads}/${row.id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">#{row.id}</div>
                            <div className="text-xs text-muted-foreground">{formatDt(row.created_at)}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{row.name}</div>
                            <div className="text-xs text-muted-foreground">{row.phone}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{LEAD_SOURCE_LABELS[row.source] || row.source || "—"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.interested_plan_type?.replace("_", " ") || "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_BADGE[row.stage] || "bg-gray-100 text-gray-600"}`}>
                              {LEAD_STAGE_LABELS[row.stage] || row.stage}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{row.assigned_to_full_name || row.assigned_to_username || "Unassigned"}</td>
                          <td className="px-4 py-3 text-xs">
                            {row.next_follow_up_at ? (
                              <span className={overdue ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                                {formatDt(row.next_follow_up_at)}{overdue ? " ⚠" : ""}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Gap 9: Pagination */}
              {totalPages > 1 ? (
                <div className="mt-4 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Page {page} of {totalPages} · {totalCount} leads</span>
                  <div className="flex gap-2">
                    <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-9 rounded-xl border border-border bg-background px-4 font-medium hover:bg-muted disabled:opacity-40">
                      ← Prev
                    </button>
                    <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-9 rounded-xl border border-border bg-background px-4 font-medium hover:bg-muted disabled:opacity-40">
                      Next →
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </ERPSectionShell>
      ) : null}

      {/* ── Online Enquiries tab (Gap 11) ─────────────────── */}
      {activeTab === "enquiries" ? (
        <ERPSectionShell
          title="Online Enquiries"
          description="Leads submitted through the public website. Click 'Promote' to move them into the CRM pipeline as a tracked lead."
        >
          {publicLoading ? <ERPLoadingState label="Loading enquiries…" /> : null}
          {!publicLoading && publicError ? <ERPErrorState title="Unable to load enquiries" description={publicError} /> : null}
          {!publicLoading && !publicError && publicLeads.length === 0 ? (
            <ERPEmptyState title="No online enquiries" description="Enquiries submitted through the public website will appear here." />
          ) : null}
          {!publicLoading && !publicError && publicLeads.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Enquiry</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3">CRM Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {publicLeads.map((pl) => {
                    const promoted = (pl.crm_pipeline_lead?.length ?? 0) > 0;
                    const crmLead = pl.crm_pipeline_lead?.[0];
                    return (
                      <tr key={pl.id} className="border-t border-border/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">#{pl.id}</div>
                          <div className="text-xs text-muted-foreground">{pl.source || "PUBLIC_SITE"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{pl.name}</div>
                          <div className="text-xs text-muted-foreground">{pl.phone}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{pl.status}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{formatDt(pl.created_at)}</td>
                        <td className="px-4 py-3">
                          {promoted && crmLead ? (
                            <Link
                              href={`${ROUTES.admin.crmLeads}/${crmLead.id}`}
                              className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700 hover:underline"
                            >
                              In pipeline · {LEAD_STAGE_LABELS[crmLead.stage as LeadStage] || crmLead.stage}
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Not promoted</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {promoted ? null : (
                            <button
                              disabled={promotingId === pl.id}
                              onClick={() => void handlePromote(pl.id)}
                              className="rounded-lg border border-primary bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            >
                              {promotingId === pl.id ? "Promoting…" : "Promote →"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </ERPSectionShell>
      ) : null}
    </ERPPageShell>
  );
}
