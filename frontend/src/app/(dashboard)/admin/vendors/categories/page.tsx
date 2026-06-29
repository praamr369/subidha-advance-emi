"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw } from "lucide-react";

import {
  AccountingNotice,
  accountingErrorMessage,
  accountingFieldClassName,
} from "@/components/accounting/shared";
import EntityDrawer from "@/components/admin-workbench/EntityDrawer";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import { ROUTES } from "@/lib/routes";
import {
  createVendorCategory,
  listVendorCategories,
  updateVendorCategory,
  type VendorCategory,
} from "@/services/vendors";

export default function AdminVendorCategoriesPage() {
  const [rows, setRows] = useState<VendorCategory[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [parent, setParent] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await listVendorCategories();
      setRows(Array.isArray(payload) ? payload : payload.results ?? []);
      setError(null);
    } catch (err) {
      setRows([]);
      setError(accountingErrorMessage(err, "Failed to load vendor categories."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim(),
        parent: parent ? Number(parent) : null,
        is_active: isActive,
      };
      const saved = editingCategoryId
        ? await updateVendorCategory(editingCategoryId, payload)
        : await createVendorCategory(payload);
      setName("");
      setCode("");
      setDescription("");
      setParent("");
      setEditingCategoryId(null);
      setIsActive(true);
      setDrawerOpen(false);
      setNotice(`Category ${saved.name} ${editingCategoryId ? "updated" : "created"}.`);
      await load();
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to create vendor category."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Purchases & Vendors"
      title="Vendor Categories"
      subtitle="Maintain the supplier taxonomy used for vendor classification, sourcing, and procurement analysis."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Vendors", href: ROUTES.admin.vendors },
        { label: "Categories" },
      ]}
      actions={[
        { href: ROUTES.admin.purchases, label: "Purchases Hub", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendors", variant: "primary" },
      ]}
      stats={[
        { label: "Categories", value: String(rows.length), tone: "info" },
        { label: "Active", value: String(rows.filter((row) => row.is_active).length), tone: "success" },
      ]}
      statusBadge={{ label: "Admin Only", tone: "info" as const }}
    >
      <div className="space-y-4">
        {notice ? <AccountingNotice message={notice} /> : null}
        {error && drawerOpen ? <AccountingNotice tone="danger" message={error} /> : null}
        <ERPSectionShell
          title="Category register"
          description="Create reusable vendor categories; duplicate names and codes are rejected by the backend."
          actions={
            <div className="flex gap-2">
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" onClick={() => { setName(""); setCode(""); setDescription(""); setParent(""); setEditingCategoryId(null); setIsActive(true); setError(null); setNotice(null); setDrawerOpen(true); }}>
                <Plus className="h-4 w-4" /> Create category
              </button>
            </div>
          }
        >
          {loading ? <ERPLoadingState label="Loading vendor categories..." /> : null}
          {!loading && error && !drawerOpen ? <ERPErrorState title="Unable to load vendor categories" description={error} onRetry={() => void load()} /> : null}
          {!loading && !error && rows.length === 0 ? <ERPEmptyState title="No vendor categories" description="Create the first category for vendor classification." /> : null}
          {!loading && !error && rows.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{row.code}</div>
                  <div className="mt-1 font-semibold text-foreground">{row.name}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{row.description || "No description"}</div>
                  <div className="mt-3 text-xs font-medium text-muted-foreground">{row.is_active ? "Active" : "Inactive"}</div>
                  <button type="button" className="mt-3 h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted" onClick={() => { setName(row.name); setCode(row.code); setDescription(row.description ?? ""); setParent(row.parent ? String(row.parent) : ""); setEditingCategoryId(row.id); setIsActive(row.is_active); setError(null); setNotice(null); setDrawerOpen(true); }}>Edit category</button>
                </div>
              ))}
            </div>
          ) : null}
        </ERPSectionShell>
      </div>

      <EntityDrawer
        open={drawerOpen}
        title={editingCategoryId ? "Edit vendor category" : "Create vendor category"}
        description="Categories organize vendors without changing purchase, payable, or accounting records."
        onClose={() => { if (!saving) setDrawerOpen(false); }}
        disableClose={saving}
        size="compact"
        footer={<div className="flex justify-end gap-3"><button type="button" className="h-10 rounded-xl border border-border px-4 text-sm font-semibold" disabled={saving} onClick={() => setDrawerOpen(false)}>Cancel</button><button type="submit" form="vendor-category-form" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={saving}>{saving ? "Saving…" : editingCategoryId ? "Update category" : "Create category"}</button></div>}
      >
        {error ? <AccountingNotice tone="danger" message={error} /> : null}
        <form id="vendor-category-form" className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-muted-foreground">Name *<input className={accountingFieldClassName()} value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
          <label className="block text-sm font-medium text-muted-foreground">Code *<input className={accountingFieldClassName()} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required placeholder="Example: RAW_MATERIAL" /></label>
          <label className="block text-sm font-medium text-muted-foreground">Parent category<select className={accountingFieldClassName()} value={parent} onChange={(event) => setParent(event.target.value)}><option value="">None</option>{rows.filter((row) => row.is_active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-muted-foreground">Description<textarea className={accountingFieldClassName()} value={description} onChange={(event) => setDescription(event.target.value)} rows={4} /></label>
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Category is active</label>
        </form>
      </EntityDrawer>
    </ERPPageShell>
  );
}
