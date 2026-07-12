"use client";

import { useEffect, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import {
  listServiceCatalog,
  createServiceCatalogItem,
  updateServiceCatalogItem,
  deleteServiceCatalogItem,
  type ServiceCatalogItem,
} from "@/services/inventory";

const EMPTY_FORM = {
  code: "",
  name: "",
  description: "",
  category: "",
  standard_price: "0.00",
  tax_rate_percent: "0.00",
  hsn_sac_code: "",
  notes: "",
  status: "ACTIVE" as "ACTIVE" | "INACTIVE",
};

export default function ServiceCatalogPage() {
  const [rows, setRows] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Create/edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  async function reload() {
    try {
      setLoading(true);
      const d = await listServiceCatalog({ q: search, page });
      setRows(d.results ?? []);
      setTotal(d.count ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, [search, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(q);
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
    setFormErr(null);
    setShowForm(true);
  }

  function openEdit(item: ServiceCatalogItem) {
    setEditId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description,
      category: item.category,
      standard_price: item.standard_price,
      tax_rate_percent: item.tax_rate_percent,
      hsn_sac_code: item.hsn_sac_code,
      notes: item.notes,
      status: item.status,
    });
    setFormErr(null);
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) { setFormErr("Code is required."); return; }
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    setSaving(true); setFormErr(null);
    try {
      if (editId) {
        await updateServiceCatalogItem(editId, form);
      } else {
        await createServiceCatalogItem(form);
      }
      setShowForm(false);
      await reload();
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ServiceCatalogItem) {
    if (!confirm(`Delete service "${item.name}"? This will fail if it's linked to finished goods.`)) return;
    try {
      await deleteServiceCatalogItem(item.id);
      await reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  async function handleToggleStatus(item: ServiceCatalogItem) {
    const newStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    try {
      await updateServiceCatalogItem(item.id, { status: newStatus });
      await reload();
    } catch (e) {
      alert(String(e));
    }
  }

  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Service Catalog"
      subtitle="Admin-managed catalog of services (installation, warranty, maintenance, AMC, etc.) that can be linked to finished goods."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Service Catalog" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
      stats={[
        { label: "Total Services", value: loading ? "—" : total, tone: "info" },
        { label: "Active", value: loading ? "—" : rows.filter((r) => r.status === "ACTIVE").length, tone: "success" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryFinishedGoods, label: "← Finished Goods", variant: "secondary" },
      ]}
    >
      {/* Top action */}
      {!showForm ? (
        <div className="flex justify-end">
          <button
            onClick={openCreate}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            + New Service
          </button>
        </div>
      ) : null}

      {/* Create / Edit form */}
      {showForm ? (
        <ERPSectionShell title={editId ? "Edit Service" : "Create New Service"}>
          <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. INST-BASIC"
                disabled={!!editId}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Basic Installation"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Installation, Warranty, AMC"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Standard Price (₹)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.standard_price}
                onChange={(e) => setForm((f) => ({ ...f, standard_price: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tax Rate %</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.tax_rate_percent}
                onChange={(e) => setForm((f) => ({ ...f, tax_rate_percent: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">HSN/SAC Code</label>
              <input
                type="text"
                value={form.hsn_sac_code}
                onChange={(e) => setForm((f) => ({ ...f, hsn_sac_code: e.target.value }))}
                placeholder="e.g. 998314"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Internal Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {editId ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as "ACTIVE" | "INACTIVE" }))}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            ) : null}

            {formErr ? (
              <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                {formErr}
              </div>
            ) : null}

            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : editId ? "Save Changes" : "Create Service"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50"
              >
                Cancel
              </button>
            </div>
          </form>
        </ERPSectionShell>
      ) : null}

      {/* Search */}
      <ERPSectionShell title="Search">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, code, category…"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90">
            Search
          </button>
          {search && (
            <button type="button" onClick={() => { setQ(""); setSearch(""); setPage(1); }} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted/50">
              Clear
            </button>
          )}
        </form>
      </ERPSectionShell>

      {/* List */}
      <ERPSectionShell title="Service Catalog Register">
        {loading ? <ERPLoadingState label="Loading services…" /> : null}
        {!loading && error ? <ERPErrorState title="Unable to load" description={error} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <ERPEmptyState title="No services yet" description='Click "+ New Service" to create the first entry.' />
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="grid gap-2">
            {rows.map((item) => (
              <div key={item.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{item.code}</span>
                    {item.category ? (
                      <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">{item.category}</span>
                    ) : null}
                  </div>
                  {item.description ? <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div> : null}
                  <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                    <span>₹{item.standard_price}</span>
                    {parseFloat(item.tax_rate_percent) > 0 ? <span>Tax {item.tax_rate_percent}%</span> : null}
                    {item.hsn_sac_code ? <span>SAC: {item.hsn_sac_code}</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ERPStatusBadge status={item.status} label={item.status} />
                  <button
                    onClick={() => handleToggleStatus(item)}
                    className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted/50"
                  >
                    {item.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted/50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className="rounded border border-destructive/30 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && numPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} of {numPages} ({total} total)</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50">Prev</button>
              <button disabled={page >= numPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-muted/50">Next</button>
            </div>
          </div>
        ) : null}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
