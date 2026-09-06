"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, Plus, Star, Trash2, X } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import {
  listServiceCatalog,
  createServiceCatalogItem,
  exportServiceCatalogToCSV,
  SERVICE_TYPE_LABELS,
  type ServiceCatalogItem,
  type ServiceType,
} from "@/services/inventory";
import { apiFetch } from "@/lib/api";

// Extended local type — backend returns more fields than the base inventory.ts type
type ServiceItem = ServiceCatalogItem & {
  standard_price?: string;
  notes?: string;
  status: string;
  code?: string;
  name?: string;
};

// ─── Shared tokens ────────────────────────────────────────────────────────────
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const SEL = INP;
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

const SERVICE_TYPES: ServiceType[] = ["WARRANTY", "INSTALLATION", "MAINTENANCE", "POLISH", "DELIVERY", "REPAIR", "ADDON", "OTHER"];

const TYPE_COLORS: Record<ServiceType, string> = {
  WARRANTY: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  INSTALLATION: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  MAINTENANCE: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  POLISH: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  DELIVERY: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  REPAIR: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  ADDON: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  OTHER: "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  INACTIVE: "bg-muted text-muted-foreground",
};

type FormState = {
  code: string; name: string; service_type: ServiceType; category: string;
  standard_price: string; tax_rate_percent: string; hsn_sac_code: string; notes: string; status: string;
};

const BLANK_FORM: FormState = {
  code: "", name: "", service_type: "OTHER", category: "",
  standard_price: "", tax_rate_percent: "18", hsn_sac_code: "", notes: "", status: "ACTIVE",
};

// ─── Inline create/edit drawer ────────────────────────────────────────────────
function ServiceForm({
  init,
  onSave,
  onCancel,
  saving,
  error,
  title,
}: {
  init: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  title: string;
}) {
  const [f, setF] = useState<FormState>(init);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-4 text-sm font-semibold text-primary">{title}</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-code-unique-auto-uppercased" className="mb-1 block text-xs font-medium text-muted-foreground">Code * <span className="text-muted-foreground font-normal">(unique, auto-uppercased)</span></label>
          <input id="f-code-unique-auto-uppercased" value={f.code} onChange={set("code")} onBlur={() => setF((s) => ({ ...s, code: s.code.trim().toUpperCase() }))} placeholder="SVC-INSTALL-BED" maxLength={40} className={INP + " font-mono"} />
        </div>
        <div>
          <label htmlFor="f-service-type" className="mb-1 block text-xs font-medium text-muted-foreground">Service Type *</label>
          <select id="f-service-type" value={f.service_type} onChange={set("service_type")} className={SEL}>
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-service-name" className="mb-1 block text-xs font-medium text-muted-foreground">Service Name *</label>
          <input id="f-service-name" value={f.name} onChange={set("name")} placeholder="e.g. Bed Assembly & Installation" maxLength={200} className={INP} />
        </div>
        <div>
          <label htmlFor="f-category-free-text" className="mb-1 block text-xs font-medium text-muted-foreground">Category <span className="font-normal text-muted-foreground">(free text)</span></label>
          <input id="f-category-free-text" value={f.category} onChange={set("category")} placeholder="After-Sales, Pre-Delivery, AMC…" maxLength={80} className={INP} />
        </div>
        <div>
          <label htmlFor="f-status" className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <select id="f-status" value={f.status} onChange={set("status")} className={SEL}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-standard-price" className="mb-1 block text-xs font-medium text-muted-foreground">Standard Price (₹) *</label>
          <input id="f-standard-price" type="number" min="0" step="0.01" value={f.standard_price} onChange={set("standard_price")} placeholder="0.00" className={INP} />
        </div>
        <div>
          <label htmlFor="f-gst-rate" className="mb-1 block text-xs font-medium text-muted-foreground">GST Rate %</label>
          <input id="f-gst-rate" type="number" min="0" max="100" step="0.01" value={f.tax_rate_percent} onChange={set("tax_rate_percent")} className={INP} />
        </div>
        <div>
          <label htmlFor="f-hsn-sac-code" className="mb-1 block text-xs font-medium text-muted-foreground">HSN / SAC Code</label>
          <input id="f-hsn-sac-code" value={f.hsn_sac_code} onChange={set("hsn_sac_code")} placeholder="998391" maxLength={20} className={INP + " font-mono"} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="f-internal-notes" className="mb-1 block text-xs font-medium text-muted-foreground">Internal Notes</label>
          <textarea id="f-internal-notes" value={f.notes} onChange={set("notes")} rows={2} placeholder="Optional description for admins" className={INP} />
        </div>
        {error && (
          <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
          </div>
        )}
        <div className="sm:col-span-2 flex gap-2">
          <button onClick={() => onSave(f)} disabled={saving} className={BTN_PRIMARY}>
            <CheckCircle className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Service"}
          </button>
          <button onClick={onCancel} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ServiceCatalogPage() {
  const [rows, setRows] = useState<ServiceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("ACTIVE");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Summary counts
  const [counts, setCounts] = useState({ active: 0, inactive: 0, total: 0 });

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Edit inline
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<FormState>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listServiceCatalog({
        page,
        page_size: PAGE_SIZE,
        q: search || undefined,
        service_type: filterType || undefined,
        status: filterStatus || undefined,
      });
      setRows((res.results ?? []) as ServiceItem[]);
      setTotal(res.count ?? 0);
      const summ = (res as { summary?: { active_count?: number; inactive_count?: number; total_services?: number } }).summary;
      if (summ) setCounts({ active: summ.active_count ?? 0, inactive: summ.inactive_count ?? 0, total: summ.total_services ?? 0 });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType, filterStatus]);

  useEffect(() => { void load(); }, [load]);

  // Debounce search reset
  useEffect(() => { setPage(1); }, [search, filterType, filterStatus]);

  async function handleCreate(f: FormState) {
    if (!f.code.trim() || !f.name.trim() || !f.standard_price) {
      setCreateErr("Code, Name and Standard Price are required."); return;
    }
    setCreateSaving(true); setCreateErr(null);
    try {
      await createServiceCatalogItem({ ...f, code: f.code.trim().toUpperCase() });
      setShowCreate(false);
      await load();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create.");
    } finally {
      setCreateSaving(false);
    }
  }

  async function handleEdit(f: FormState) {
    if (!editId) return;
    if (!f.code.trim() || !f.name.trim() || !f.standard_price) {
      setEditErr("Code, Name and Standard Price are required."); return;
    }
    setEditSaving(true); setEditErr(null);
    try {
      await apiFetch(`/admin/inventory/service-catalog/${editId}/`, {
        method: "PATCH",
        body: JSON.stringify({ ...f, code: f.code.trim().toUpperCase() }),
      });
      setEditId(null);
      await load();
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeleting(true); setDeleteErr(null);
    try {
      await apiFetch(`/admin/inventory/service-catalog/${id}/`, { method: "DELETE" });
      setDeleteId(null);
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Cannot delete — may be linked to finished goods.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleStatus(svc: ServiceCatalogItem) {
    const newStatus = svc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await apiFetch(`/admin/inventory/service-catalog/${svc.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status.");
    }
  }

  const numPages = Math.ceil(total / PAGE_SIZE);

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Service Catalog"
      subtitle="Create and manage services (warranty, installation, AMC, delivery) that can be linked to finished goods for billing."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Service Catalog" },
      ]}
      statusBadge={{ label: "Admin Managed", tone: "info" as const }}
      stats={[
        { label: "Total Services", value: counts.total || total, tone: "default" },
        { label: "Active", value: counts.active, tone: "success" },
        { label: "Inactive", value: counts.inactive, tone: "warning" },
      ]}
    >
      <div className="space-y-5">

        {/* ── Create form ──────────────────────────────────────────────────── */}
        {showCreate ? (
          <ServiceForm
            init={BLANK_FORM}
            title="Create New Service"
            onSave={handleCreate}
            onCancel={() => { setShowCreate(false); setCreateErr(null); }}
            saving={createSaving}
            error={createErr}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" />New Service
            </button>
            <button
              onClick={async () => { setExporting(true); try { await exportServiceCatalogToCSV({ q: search, service_type: filterType, status: filterStatus }); } finally { setExporting(false); } }}
              disabled={exporting || rows.length === 0}
              className={BTN_GHOST}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code, name, category…"
            className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Types</option>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          {(search || filterType || filterStatus !== "ACTIVE") && (
            <button onClick={() => { setSearch(""); setFilterType(""); setFilterStatus("ACTIVE"); }} className={BTN_GHOST}>
              <X className="h-3.5 w-3.5" />Clear
            </button>
          )}
          <span className="self-center text-xs text-muted-foreground">{total} service{total === 1 ? "" : "s"}</span>
        </div>

        {/* ── Service cards ─────────────────────────────────────────────────── */}
        {loading ? (
          <ERPLoadingState label="Loading service catalog…" />
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
          </div>
        ) : rows.length === 0 ? (
          <ERPEmptyState
            title="No services yet"
            description={search || filterType ? "No services match your filters. Try clearing them." : "Click 'New Service' to add your first service (warranty, installation, AMC, etc.)."}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((svc) => {
              const isEditing = editId === svc.id;
              const isDeleting = deleteId === svc.id;
              const typeColor = TYPE_COLORS[svc.service_type as ServiceType] ?? TYPE_COLORS.OTHER;
              return (
                <div key={svc.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Row */}
                  <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                    {/* Icon + name */}
                    <div className="flex items-center gap-2.5 mt-0.5">
                      <Star className="h-4 w-4 shrink-0 text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{svc.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeColor}`}>
                          {SERVICE_TYPE_LABELS[svc.service_type as ServiceType] ?? svc.service_type}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[svc.status] ?? STATUS_COLORS.INACTIVE}`}>
                          {svc.status}
                        </span>
                        {svc.category ? <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">{svc.category}</span> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-mono">{svc.code}</span>
                        <span>Std ₹{svc.standard_price}</span>
                        {Number(svc.tax_rate_percent) > 0 ? <span>GST {svc.tax_rate_percent}%</span> : null}
                        {svc.hsn_sac_code ? <span>SAC {svc.hsn_sac_code}</span> : null}
                        {svc.notes ? <span className="italic">{svc.notes}</span> : null}
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => handleToggleStatus(svc)}
                        className={BTN_GHOST}
                        title={svc.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      >
                        {svc.status === "ACTIVE" ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => {
                          if (isEditing) { setEditId(null); return; }
                          setEditId(svc.id ?? null);
                          setEditForm({
                            code: svc.code ?? "", name: svc.name ?? "",
                            service_type: (svc.service_type as ServiceType) ?? "OTHER",
                            category: svc.category ?? "",
                            standard_price: svc.standard_price ?? "",
                            tax_rate_percent: svc.tax_rate_percent ?? "0",
                            hsn_sac_code: svc.hsn_sac_code ?? "",
                            notes: svc.notes ?? "",
                            status: svc.status ?? "ACTIVE",
                          });
                          setEditErr(null);
                          setDeleteId(null);
                        }}
                        className={BTN_GHOST}
                      >
                        <Edit2 className="h-3.5 w-3.5" />{isEditing ? "Close" : "Edit"}
                      </button>
                      <button
                        onClick={() => { setDeleteId(isDeleting ? null : (svc.id ?? null)); setDeleteErr(null); setEditId(null); }}
                        className={BTN_DANGER}
                      >
                        <Trash2 className="h-3.5 w-3.5" />{isDeleting ? "Cancel" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {isEditing && (
                    <div className="border-t border-border px-4 pb-5 pt-3">
                      <ServiceForm
                        init={editForm}
                        title="Edit Service"
                        onSave={handleEdit}
                        onCancel={() => setEditId(null)}
                        saving={editSaving}
                        error={editErr}
                      />
                    </div>
                  )}

                  {/* Inline delete confirm */}
                  {isDeleting && (
                    <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 flex flex-wrap items-center gap-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-sm text-destructive flex-1">Delete <strong>{svc.name}</strong>? This cannot be undone. If linked to a finished good, deletion will be blocked.</span>
                      {deleteErr && <span className="text-xs text-destructive">{deleteErr}</span>}
                      <button onClick={() => handleDelete(svc.id!)} disabled={deleting} className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition">
                        {deleting ? "Deleting…" : "Confirm Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {numPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(1)} className={BTN_GHOST}>First</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className={BTN_GHOST}>Prev</button>
              <span className="self-center px-3 text-xs">{page} / {numPages}</span>
              <button disabled={page === numPages} onClick={() => setPage((p) => p + 1)} className={BTN_GHOST}>Next</button>
              <button disabled={page === numPages} onClick={() => setPage(numPages)} className={BTN_GHOST}>Last</button>
            </div>
          </div>
        )}

        {/* ── Workflow guide ───────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Workflow</div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><span className="font-semibold text-foreground">1. Create services here</span> — warranty, installation, AMC, polish, delivery etc. Set standard price and GST rate.</li>
            <li><span className="font-semibold text-foreground">2. Link to Finished Good</span> — go to a finished good profile → Services tab → Add Service → choose from catalog.</li>
            <li><span className="font-semibold text-foreground">3. Set charge mode</span> — Free (included in sale price) or Chargeable (billed separately).</li>
            <li><span className="font-semibold text-foreground">4. Pre-select flag</span> — mark a service as default to auto-include it on new contracts / subscriptions for that product.</li>
          </ol>
        </div>

      </div>
    </ERPPageShell>
  );
}
