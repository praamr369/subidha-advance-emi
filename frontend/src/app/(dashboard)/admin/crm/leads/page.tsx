"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  getInternalCrmLeads,
  createInternalLead,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCE_LABELS,
  type InternalLeadRow,
  type LeadStage,
  type LeadPlanType,
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
  name: string;
  phone: string;
  email: string;
  source: string;
  interested_plan_type: LeadPlanType;
  next_follow_up_at: string;
};

const EMPTY_FORM: AddLeadForm = {
  name: "",
  phone: "",
  email: "",
  source: "WALK_IN",
  interested_plan_type: "LUCKY_PLAN",
  next_follow_up_at: "",
};

export default function AdminCrmLeadRegisterPage() {
  const [rows, setRows] = useState<InternalLeadRow[]>([]);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState<LeadStage | "">("");
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddLeadForm>(EMPTY_FORM);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getInternalCrmLeads({
        q: search || undefined,
        stage: filterStage || undefined,
      });
      setRows(data.results);
      setStageCounts(data.stage_counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load leads.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStage]);

  useEffect(() => { void load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setAddError("Name and phone are required.");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      await createInternalLead({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        source: form.source,
        interested_plan_type: form.interested_plan_type,
        next_follow_up_at: form.next_follow_up_at
          ? new Date(form.next_follow_up_at).toISOString()
          : undefined,
      });
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to create lead.");
    } finally {
      setAddBusy(false);
    }
  };

  const totalActive = Object.entries(stageCounts)
    .filter(([s]) => s !== "CONVERTED" && s !== "LOST")
    .reduce((sum, [, c]) => sum + c, 0);

  return (
    <ERPPageShell
      title="CRM Leads"
      subtitle="Internal lead pipeline for Lucky Plan, rent/lease, and direct-sale conversion."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "CRM", href: ROUTES.admin.crm },
        { label: "Leads" },
      ]}
      stats={[
        { label: "Total", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(totalActive), tone: "default" },
        { label: "Converted", value: String(stageCounts["CONVERTED"] || 0), tone: "success" },
        { label: "Lost", value: String(stageCounts["LOST"] || 0), tone: "warning" },
      ]}
    >
      <ERPSectionShell title="Lead register" description="Click any lead row to open the full detail view with follow-up tasks and opportunities.">

        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <input
            type="text"
            placeholder="Search name / phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            className="h-9 w-52 rounded-xl border border-border bg-background px-3 text-sm"
          />
          <select
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value as LeadStage | "")}
            className="h-9 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STAGE_LABELS[s]} ({stageCounts[s] || 0})
              </option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            className="h-9 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Search
          </button>
          <div className="ml-auto flex gap-2">
            <Link
              href={ROUTES.admin.crmPipeline}
              className="flex h-9 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
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
          <div className="mb-5 rounded-xl border border-border bg-[var(--surface-card-elevated)] p-5">
            <div className="mb-3 text-sm font-semibold text-foreground">New Lead</div>
            {addError ? (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{addError}</div>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="block text-xs font-medium mb-1">Full name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ramesh Kumar"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="9876543210"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="ramesh@example.com"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Lead source</label>
                <select
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {SOURCES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Plan interest</label>
                <select
                  value={form.interested_plan_type}
                  onChange={(e) => setForm({ ...form, interested_plan_type: e.target.value as LeadPlanType })}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {PLAN_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">First follow-up</label>
                <input
                  type="datetime-local"
                  value={form.next_follow_up_at}
                  onChange={(e) => setForm({ ...form, next_follow_up_at: e.target.value })}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                disabled={addBusy}
                onClick={() => void handleAdd()}
                className="rounded-xl border border-primary bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {addBusy ? "Saving…" : "Create Lead"}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setForm(EMPTY_FORM); setAddError(null); }}
                className="rounded-xl border border-border px-5 py-2 text-sm hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {/* Table */}
        {loading ? <ERPLoadingState label="Loading leads…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load leads" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No leads found" description="Create the first lead or adjust the search filters." />
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--surface-muted)]">
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
                  const overdue =
                    row.next_follow_up_at && new Date(row.next_follow_up_at) <= new Date();
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-border/60 hover:bg-[var(--surface-muted)] cursor-pointer"
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
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {LEAD_SOURCE_LABELS[row.source] || row.source || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.interested_plan_type?.replace("_", " ") || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STAGE_BADGE[row.stage] || "bg-gray-100 text-gray-600"}`}>
                          {LEAD_STAGE_LABELS[row.stage] || row.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.assigned_to_full_name || row.assigned_to_username || "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {row.next_follow_up_at ? (
                          <span className={overdue ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                            {formatDt(row.next_follow_up_at)}
                            {overdue ? " ⚠" : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
    </ERPPageShell>
  );
}
