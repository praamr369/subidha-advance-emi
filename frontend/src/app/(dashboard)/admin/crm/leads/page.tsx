"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Search, Plus, ArrowRight, Clock, CheckCircle, AlertCircle, ChevronRight, UserCheck } from "lucide-react";

import ERPPageShell from "@/components/erp/ERPPageShell";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/feedback/EmptyState";
import {
  createInternalLead,
  getInternalCrmLeads,
  promotePublicLeadToCrm,
  reconcileLead,
  reconcileAllLeads,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type InternalLeadRow,
  type LeadPlanType,
  type LeadStage,
} from "@/services/crm-module";

function formatDt(value?: string | null) {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); } catch { return value; }
}

const PLAN_TYPES: { value: LeadPlanType; label: string }[] = [
  { value: "LUCKY_PLAN", label: "Lucky Plan" },
  { value: "DIRECT_SALE", label: "Direct Sale" },
  { value: "RENT", label: "Rent" },
  { value: "LEASE", label: "Lease" },
];

const STAGE_BADGE: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-200",
  CONTACTED: "bg-purple-100 text-purple-800 border-purple-200",
  INTERESTED: "bg-yellow-100 text-yellow-800 border-yellow-200",
  KYC_PENDING: "bg-orange-100 text-orange-800 border-orange-200",
  READY_TO_CONVERT: "bg-teal-100 text-teal-800 border-teal-200",
  CONVERTED: "bg-green-100 text-green-800 border-green-200",
  LOST: "bg-gray-100 text-muted-foreground border-gray-200",
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
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddLeadForm>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  // Public leads state
  const [publicLeads, setPublicLeads] = useState<PublicLeadRow[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInternalCrmLeads({
        q: search || undefined,
        stage: filterStage || undefined,
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
  }, [search, filterStage, page]);

  useEffect(() => { void load(); }, [load]);

  const [reconcilingId, setReconcilingId] = useState<number | null>(null);
  const [reconcileAllBusy, setReconcileAllBusy] = useState(false);

  const handleReconcile = useCallback(async (id: number) => {
    setReconcilingId(id);
    try {
      await reconcileLead(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile failed.");
    } finally {
      setReconcilingId(null);
    }
  }, [load]);

  const handleReconcileAll = useCallback(async () => {
    setReconcileAllBusy(true);
    try {
      const res = await reconcileAllLeads();
      await load();
      setError(res.reconciled > 0 ? null : "No leads needed reconciling.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconcile-all failed.");
    } finally {
      setReconcileAllBusy(false);
    }
  }, [load]);

  const loadPublicLeads = useCallback(async () => {
    if (publicLeads.length > 0) return;
    setPublicLoading(true);
    try {
      const data = await apiFetch<{ results: PublicLeadRow[] }>("/admin/leads/");
      setPublicLeads(Array.isArray(data?.results) ? data.results : []);
    } catch (err) {
      console.error("Unable to load online enquiries.", err);
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
      const e = err as { status?: number; body?: { existing_lead_id?: number } };
      if (e?.status === 409 && e?.body?.existing_lead_id) {
        setAddError(`Duplicate phone: lead #${e.body.existing_lead_id} already exists.`);
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
      eyebrow="CRM"
      title="Leads & Enquiries"
      subtitle="Manage your pipeline and promote incoming public enquiries to active leads."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Leads" },
      ]}
      actions={[
        { href: ROUTES.admin.crmAnalytics, label: "Pipeline Board", variant: "secondary" },
      ]}
    >
      {/* Modern KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total Leads</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl font-bold text-foreground">{totalCount}</span>
          </div>
        </div>
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <p className="text-sm font-medium text-blue-800">Active Pipeline</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl font-bold text-blue-900">{totalActive}</span>
            <Activity className="w-5 h-5 text-blue-500 ml-auto opacity-50" />
          </div>
        </div>
        <div className="bg-green-50/50 border border-green-100 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <p className="text-sm font-medium text-green-800">Converted</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl font-bold text-green-900">{stageCounts["CONVERTED"] || 0}</span>
            <CheckCircle className="w-5 h-5 text-green-500 ml-auto opacity-50" />
          </div>
        </div>
        <div className="bg-orange-50/50 border border-orange-100 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <p className="text-sm font-medium text-orange-800">Unreviewed Enquiries</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-3xl font-bold text-orange-900">{unreviewedPublicLeads.length}</span>
            <AlertCircle className="w-5 h-5 text-orange-500 ml-auto opacity-50" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-border mb-6">
        <button
          className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === "pipeline" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          onClick={() => setActiveTab("pipeline")}
        >
          Pipeline Leads
        </button>
        <button
          className={cn("px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2", activeTab === "enquiries" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          onClick={() => setActiveTab("enquiries")}
        >
          Online Enquiries
          {unreviewedPublicLeads.length > 0 && (
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {unreviewedPublicLeads.length}
            </span>
          )}
        </button>
      </div>

      {/* -- Pipeline Tab ------------------------------------ */}
      {activeTab === "pipeline" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search name or phone..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  onKeyDown={(e) => e.key === "Enter" && void load()}
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:ring-1 focus:ring-primary"
                />
              </div>
              <select
                value={filterStage}
                onChange={(e) => { setFilterStage(e.target.value as LeadStage | ""); setPage(1); }}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:ring-1 focus:ring-primary"
              >
                <option value="">All Stages</option>
                {LEAD_STAGES.map((s) => (
                  <option key={s} value={s}>{LEAD_STAGE_LABELS[s]} ({stageCounts[s] || 0})</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={() => void handleReconcileAll()}
              disabled={reconcileAllBusy}
              title="Sweep and reconcile every lead whose stage drifted from customer truth."
              className="flex items-center gap-2 h-9 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100 w-full sm:w-auto justify-center transition-colors disabled:opacity-50"
            >
              <AlertCircle className="w-4 h-4" /> {reconcileAllBusy ? "Reconciling…" : "Reconcile all"}
            </button>

            <button
              onClick={() => { setShowAddForm((v) => !v); setAddError(null); }}
              className="flex items-center gap-2 h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 w-full sm:w-auto justify-center transition-opacity"
            >
              <Plus className="w-4 h-4" /> Add Lead
            </button>
          </div>

          {/* Add Lead Form */}
          {showAddForm && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm animate-in fade-in slide-in-from-top-2">
              <h3 className="text-lg font-semibold mb-4">Register New Lead</h3>
              {addError && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">{addError}</div>}
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="f-full-name" className="text-xs font-medium text-muted-foreground">Full Name *</label>
                  <input id="f-full-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="f-phone" className="text-xs font-medium text-muted-foreground">Phone *</label>
                  <input id="f-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="f-email" className="text-xs font-medium text-muted-foreground">Email</label>
                  <input id="f-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="f-lead-source" className="text-xs font-medium text-muted-foreground">Lead Source</label>
                  <select id="f-lead-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary">
                    {SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="f-plan-interest" className="text-xs font-medium text-muted-foreground">Plan Interest</label>
                  <select id="f-plan-interest" value={form.interested_plan_type} onChange={(e) => setForm({ ...form, interested_plan_type: e.target.value as LeadPlanType })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary">
                    {PLAN_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="f-first-follow-up-date" className="text-xs font-medium text-muted-foreground">First Follow-up Date</label>
                  <input id="f-first-follow-up-date" type="datetime-local" value={form.next_follow_up_at} onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:ring-1 focus:ring-primary" />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3 border-t border-border pt-4">
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-md transition-colors">
                  Cancel
                </button>
                <button disabled={addBusy} onClick={() => void handleAdd()} className="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {addBusy ? "Saving..." : "Create Lead"}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-card border border-border rounded-xl min-h-[400px] overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-[400px] text-muted-foreground text-sm animate-pulse">Loading leads...</div>
            ) : error ? (
              <div className="p-12 text-center text-red-600 text-sm">{error}</div>
            ) : rows.length === 0 ? (
              <div className="p-12">
                <EmptyState title="No leads found" description="Adjust your filters or create a new lead." tone="default" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider text-left border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Lead Info</th>
                      <th className="px-6 py-4 font-medium">Interest</th>
                      <th className="px-6 py-4 font-medium">Stage</th>
                      <th className="px-6 py-4 font-medium">Assigned To</th>
                      <th className="px-6 py-4 font-medium">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => {
                      const overdue = row.next_follow_up_at && new Date(row.next_follow_up_at) <= new Date();
                      return (
                        <tr
                          key={row.id}
                          onClick={() => (window.location.href = `${ROUTES.admin.crmLeads}/${row.id}`)}
                          className="hover:bg-muted/30 transition-colors cursor-pointer group"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{row.name}</span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">#{row.id}</span>
                              {row.registered_customer ? (
                                <Link
                                  href={`/admin/customers/${row.registered_customer.id}`}
                                  onClick={(e) => e.stopPropagation()}
                                  title={row.registered_customer.matched_by === "converted"
                                    ? "Converted to a registered customer — open customer 360"
                                    : "Existing registered customer with this phone — open customer 360"}
                                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  <UserCheck className="w-3 h-3" /> Registered
                                </Link>
                              ) : null}
                              {row.registered_customer && row.stage !== "CONVERTED" ? (
                                <button
                                  type="button"
                                  disabled={reconcilingId === row.id}
                                  onClick={(e) => { e.stopPropagation(); void handleReconcile(row.id); }}
                                  title={row.registered_customer.matched_by === "converted"
                                    ? "Linked to a registered customer but stage isn't Converted. Click to reconcile (advances the stage)."
                                    : "Matches a registered customer by phone. Click to reconcile (links the customer and converts)."}
                                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  <AlertCircle className="w-3 h-3" /> {reconcilingId === row.id ? "Reconciling…" : "Reconcile"}
                                </button>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-0.5">
                              <span>{row.phone}</span>
                              <span className="opacity-75">{LEAD_SOURCE_LABELS[row.source] || row.source}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-muted">
                              {row.interested_plan_type?.replace("_", " ") || "Not specified"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", STAGE_BADGE[row.stage] || "bg-gray-100 text-muted-foreground border-gray-200")}>
                              {LEAD_STAGE_LABELS[row.stage] || row.stage}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {row.assigned_to_full_name || row.assigned_to_username ? (
                                <span className="text-sm font-medium">{row.assigned_to_full_name || row.assigned_to_username}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">Unassigned</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {row.next_follow_up_at ? (
                              <div className={cn("flex items-center gap-1.5 text-xs font-medium", overdue ? "text-orange-600" : "text-muted-foreground")}>
                                <Clock className="w-3.5 h-3.5" />
                                {formatDt(row.next_follow_up_at)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">Showing page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors">Previous</button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Online Enquiries Tab ------------------------------ */}
      {activeTab === "enquiries" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-card border border-border rounded-xl min-h-[400px] overflow-hidden">
            {publicLoading ? (
              <div className="flex justify-center items-center h-[400px] text-muted-foreground text-sm animate-pulse">Loading online enquiries...</div>
            ) : publicLeads.length === 0 ? (
              <div className="p-12">
                <EmptyState title="No new enquiries" description="The public website enquiry inbox is empty." tone="info" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider text-left border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Visitor details</th>
                      <th className="px-6 py-4 font-medium">Source / Time</th>
                      <th className="px-6 py-4 font-medium">Pipeline Status</th>
                      <th className="px-6 py-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {publicLeads.map((pl) => {
                      const promoted = (pl.crm_pipeline_lead?.length ?? 0) > 0;
                      const crmLead = pl.crm_pipeline_lead?.[0];
                      return (
                        <tr key={pl.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-foreground">{pl.name}</div>
                            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                              <span>{pl.phone}</span>
                              {pl.email && <span>· {pl.email}</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                              {pl.source || "WEBSITE"}
                            </span>
                            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDt(pl.created_at)}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {promoted && crmLead ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-500" />
                                <div className="text-xs font-medium text-green-700">In Pipeline</div>
                                <span className="mx-1 text-muted-foreground">·</span>
                                <span className="text-xs text-muted-foreground">{LEAD_STAGE_LABELS[crmLead.stage as LeadStage] || crmLead.stage}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-orange-500" />
                                <span className="text-xs font-medium text-orange-700">Awaiting Review</span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {promoted && crmLead ? (
                              <Link
                                href={`${ROUTES.admin.crmLeads}/${crmLead.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
                              >
                                View Lead <ChevronRight className="w-3 h-3" />
                              </Link>
                            ) : (
                              <button
                                disabled={promotingId === pl.id}
                                onClick={() => void handlePromote(pl.id)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                              >
                                {promotingId === pl.id ? "Promoting..." : (
                                  <>Convert to Lead <ArrowRight className="w-3.5 h-3.5" /></>
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}

const Activity = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
);

