"use client";

import { useCallback, useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import {
  listAccessoryVariantGroups,
  createAccessoryVariantGroup,
  updateAccessoryVariantGroup,
  deleteAccessoryVariantGroup,
  type AccessoryVariantGroup,
} from "@/services/inventory";
import { ROUTES } from "@/lib/routes";

type FormData = {
  code: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
};

const EMPTY_FORM: FormData = {
  code: "",
  name: "",
  category: "",
  subcategory: "",
  description: "",
  is_required: false,
  is_active: true,
  sort_order: 1,
};

export default function AccessoryVariantGroupsPage() {
  const [groups, setGroups] = useState<AccessoryVariantGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AccessoryVariantGroup | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAccessoryVariantGroups({ q, page, page_size: pageSize });
      setGroups(res.results);
      setTotal(res.count);
    } catch {
      setError("Failed to load variant groups.");
    } finally {
      setLoading(false);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(g: AccessoryVariantGroup) {
    setEditing(g);
    setForm({
      code: g.code,
      name: g.name,
      category: g.category,
      subcategory: g.subcategory,
      description: g.description,
      is_required: g.is_required,
      is_active: g.is_active,
      sort_order: g.sort_order,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Code and Name are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAccessoryVariantGroup(editing.id, form);
      } else {
        await createAccessoryVariantGroup({ ...form, code: form.code.trim().toUpperCase() });
      }
      setShowForm(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to save.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(g: AccessoryVariantGroup) {
    if (!confirm(`Delete variant group "${g.name}"? This cannot be undone.`)) return;
    try {
      await deleteAccessoryVariantGroup(g.id);
      load();
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Cannot delete — the group may still have linked variants or finished goods.";
      alert(msg);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <ERPPageShell
      title="Accessory Variant Groups"
      actions={[
        { label: "Finished Goods", href: ROUTES.admin.inventoryFinishedGoods, variant: "secondary" as const },
        { label: "Accessories", href: ROUTES.admin.inventoryAccessories, variant: "secondary" as const },
      ]}
    >
      {/* Actions bar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search groups…"
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-56"
        />
        <button
          type="button"
          onClick={openCreate}
          className="ml-auto rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          + New Group
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No variant groups yet. Create one to group accessory variants (e.g. all Side Rail types).
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-semibold text-foreground">Code</th>
                <th className="px-4 py-2.5 text-left font-semibold text-foreground">Name</th>
                <th className="px-4 py-2.5 text-left font-semibold text-foreground hidden md:table-cell">Category</th>
                <th className="px-4 py-2.5 text-center font-semibold text-foreground">Variants</th>
                <th className="px-4 py-2.5 text-center font-semibold text-foreground hidden sm:table-cell">Required</th>
                <th className="px-4 py-2.5 text-center font-semibold text-foreground hidden sm:table-cell">Active</th>
                <th className="px-4 py-2.5 text-right font-semibold text-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{g.code}</td>
                  <td className="px-4 py-2.5 text-foreground">
                    <div className="font-medium">{g.name}</div>
                    {g.description && <div className="text-xs text-muted-foreground line-clamp-1">{g.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {[g.category, g.subcategory].filter(Boolean).join(" › ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{g.variant_count}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                    {g.is_required ? (
                      <span className="text-xs font-semibold text-destructive">Yes</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center hidden sm:table-cell">
                    {g.is_active ? (
                      <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400">Active</span>
                    ) : (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="rounded px-2 py-1 text-xs text-primary hover:bg-primary/10 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(g)}
                        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <span>{total} groups</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40">Prev</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded px-2 py-1 hover:bg-muted disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                {editing ? "Edit Variant Group" : "New Variant Group"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded p-1.5 text-muted-foreground hover:bg-muted">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {formError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <F label="Code *" id="vg-code">
                  <input id="vg-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!!editing} placeholder="SIDE-RAIL" maxLength={40} className={IN} />
                </F>
                <F label="Sort Order" id="vg-sort">
                  <input id="vg-sort" type="number" min={1} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={IN} />
                </F>
              </div>
              <F label="Name *" id="vg-name">
                <input id="vg-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Side Rail" maxLength={160} className={IN} />
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Category" id="vg-cat">
                  <input id="vg-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Wood Parts" maxLength={80} className={IN} />
                </F>
                <F label="Subcategory" id="vg-subcat">
                  <input id="vg-subcat" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} placeholder="Rails" maxLength={80} className={IN} />
                </F>
              </div>
              <F label="Description" id="vg-desc">
                <textarea id="vg-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${IN} resize-none`} />
              </F>
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} className="h-4 w-4 rounded accent-primary" />
                  Required (must select one variant in billing)
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 rounded accent-primary" />
                  Active
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-5 py-4">
              <button type="button" onClick={handleSave} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </ERPPageShell>
  );
}

function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

const IN = "block w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
