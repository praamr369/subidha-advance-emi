"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import {
  listAccessoryVariantGroups,
  createAccessoryVariantGroup,
  updateAccessoryVariantGroup,
  deleteAccessoryVariantGroup,
  listAccessories,
  listFinishedGoods,
  assignAccessoryVariantGroup,
  addFGAccessoryGroupLink,
  deleteFGAccessoryLink,
  type AccessoryVariantGroup,
  type AccessoryRow,
  type FinishedGoodRow,
} from "@/services/inventory";
import { apiFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { ExternalLink, Layers, Package, Plus, Trash2, X } from "lucide-react";

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

  // Inspector drawer for selected group
  const [inspectGroup, setInspectGroup] = useState<AccessoryVariantGroup | null>(null);
  const [inspectTab, setInspectTab] = useState<"variants" | "finished_goods">("variants");
  const [inspectLoading, setInspectLoading] = useState(false);

  // Catalogs for attaching to group
  const [allAccessories, setAllAccessories] = useState<AccessoryRow[]>([]);
  const [allFinishedGoods, setAllFinishedGoods] = useState<FinishedGoodRow[]>([]);

  // Attach Variant Form
  const [attachAccId, setAttachAccId] = useState<number | "">("");
  const [attachVariantLabel, setAttachVariantLabel] = useState("");
  const [attachingVariant, setAttachingVariant] = useState(false);
  const [attachVariantErr, setAttachVariantErr] = useState<string | null>(null);

  // Link Finished Good Form
  const [linkFgId, setLinkFgId] = useState<number | "">("");
  const [linkChargeMode, setLinkChargeMode] = useState<"FREE" | "CHARGEABLE">("FREE");
  const [linkSalePrice, setLinkSalePrice] = useState("0.00");
  const [linkQuantity, setLinkQuantity] = useState("1.00");
  const [linkDefaultIncluded, setLinkDefaultIncluded] = useState(true);
  const [linkingFg, setLinkingFg] = useState(false);
  const [linkFgErr, setLinkFgErr] = useState<string | null>(null);

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

  const loadLookups = useCallback(async () => {
    try {
      const [accRes, fgRes] = await Promise.all([
        listAccessories({ page_size: 100 }),
        listFinishedGoods({ page_size: 100 }),
      ]);
      setAllAccessories(accRes.results ?? []);
      setAllFinishedGoods(fgRes.results ?? []);
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadLookups(); }, [loadLookups]);

  const openInspector = async (group: AccessoryVariantGroup, tab: "variants" | "finished_goods" = "variants") => {
    setInspectTab(tab);
    setInspectLoading(true);
    setAttachVariantErr(null);
    setLinkFgErr(null);
    try {
      const detail = await apiFetch<AccessoryVariantGroup>(`/admin/inventory/accessory-variant-groups/${group.id}/`);
      setInspectGroup(detail);
    } catch {
      setInspectGroup(group);
    } finally {
      setInspectLoading(false);
    }
  };

  const refreshInspector = async (groupId: number) => {
    try {
      const detail = await apiFetch<AccessoryVariantGroup>(`/admin/inventory/accessory-variant-groups/${groupId}/`);
      setInspectGroup(detail);
      load();
    } catch {
      // Non-fatal
    }
  };

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

  // ── Attach Accessory Variant to Group ───────────────────────────────────────
  async function handleAttachVariant(e: React.FormEvent) {
    e.preventDefault();
    if (!inspectGroup || !attachAccId) {
      setAttachVariantErr("Please select an accessory.");
      return;
    }
    setAttachingVariant(true);
    setAttachVariantErr(null);
    try {
      await assignAccessoryVariantGroup(Number(attachAccId), {
        variant_group: inspectGroup.id,
        variant_label: attachVariantLabel.trim(),
      });
      setAttachAccId("");
      setAttachVariantLabel("");
      await refreshInspector(inspectGroup.id);
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to attach variant.";
      setAttachVariantErr(msg);
    } finally {
      setAttachingVariant(false);
    }
  }

  // ── Unassign Accessory Variant from Group ───────────────────────────────────
  async function handleUnassignVariant(accId: number) {
    if (!inspectGroup || !confirm("Unassign this accessory variant from the group?")) return;
    try {
      await assignAccessoryVariantGroup(accId, {
        variant_group: null,
        variant_label: "",
      });
      await refreshInspector(inspectGroup.id);
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to unassign variant.";
      alert(msg);
    }
  }

  // ── Link Finished Good to Variant Group ─────────────────────────────────────
  async function handleLinkFg(e: React.FormEvent) {
    e.preventDefault();
    if (!inspectGroup || !linkFgId) {
      setLinkFgErr("Please select a finished good.");
      return;
    }
    setLinkingFg(true);
    setLinkFgErr(null);
    try {
      await addFGAccessoryGroupLink(Number(linkFgId), {
        variant_group: inspectGroup.id,
        charge_mode: linkChargeMode,
        sale_price: linkChargeMode === "FREE" ? "0.00" : linkSalePrice,
        quantity: linkQuantity,
        is_default_included: linkDefaultIncluded,
      });
      setLinkFgId("");
      setLinkSalePrice("0.00");
      setLinkQuantity("1.00");
      await refreshInspector(inspectGroup.id);
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to link finished good.";
      setLinkFgErr(msg);
    } finally {
      setLinkingFg(false);
    }
  }

  // ── Unlink Finished Good from Variant Group ─────────────────────────────────
  async function handleUnlinkFg(fgId: number, linkId: number) {
    if (!inspectGroup || !confirm("Unlink this finished good from the variant group?")) return;
    try {
      await deleteFGAccessoryLink(fgId, linkId);
      await refreshInspector(inspectGroup.id);
    } catch (err: unknown) {
      const msg = (err as { detail?: string })?.detail ?? "Failed to unlink finished good.";
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
                    <button
                      type="button"
                      onClick={() => openInspector(g)}
                      className="font-medium text-left hover:text-primary transition-colors hover:underline"
                    >
                      {g.name}
                    </button>
                    {g.description && <div className="text-xs text-muted-foreground line-clamp-1">{g.description}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {[g.category, g.subcategory].filter(Boolean).join(" › ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => openInspector(g, "variants")}
                      className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                      title="Inspect member variants"
                    >
                      {g.variant_count}
                    </button>
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
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openInspector(g)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                        title="Manage variants and finished goods links"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Manage
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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

      {/* Create / Edit master group modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                {editing ? "Edit Variant Group" : "New Variant Group"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
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

      {/* ── Group Details & Links Drawer ── */}
      {inspectGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground truncate">
                    {inspectGroup.name}
                  </h2>
                  <span className="font-mono text-xs rounded-md bg-muted px-2 py-0.5 text-muted-foreground">
                    {inspectGroup.code}
                  </span>
                  {inspectGroup.is_required && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      Required at Billing
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                  <span>Category: {[inspectGroup.category, inspectGroup.subcategory].filter(Boolean).join(" › ") || "General"}</span>
                  <span>Sort Order: {inspectGroup.sort_order}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectGroup(null)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-border bg-muted/10 px-6">
              <button
                type="button"
                onClick={() => setInspectTab("variants")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${inspectTab === "variants" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Layers className="h-4 w-4" /> Member Variants ({inspectGroup.variants?.length ?? inspectGroup.variant_count ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setInspectTab("finished_goods")}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${inspectTab === "finished_goods" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <Package className="h-4 w-4" /> Linked Finished Goods ({inspectGroup.linked_finished_goods?.length ?? 0})
              </button>
            </div>

            {/* Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {inspectLoading ? (
                <ERPLoadingState label="Loading group details…" />
              ) : inspectTab === "variants" ? (
                <div className="space-y-6">
                  {/* Attach Variant Form */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm text-foreground">Attach Accessory as Variant</h3>
                    </div>

                    <form onSubmit={handleAttachVariant} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-muted-foreground mb-1">Select Accessory *</label>
                        <select
                          value={attachAccId}
                          onChange={(e) => setAttachAccId(e.target.value ? Number(e.target.value) : "")}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none"
                        >
                          <option value="">-- Choose accessory from catalog --</option>
                          {allAccessories.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.product_name || acc.name} ({acc.product_code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-muted-foreground mb-1">Variant Label *</label>
                        <div className="flex gap-2">
                          <input
                            value={attachVariantLabel}
                            onChange={(e) => setAttachVariantLabel(e.target.value)}
                            placeholder="e.g. Teak Wood 6ft"
                            className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none"
                          />
                          <button
                            type="submit"
                            disabled={attachingVariant || !attachAccId}
                            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50 shrink-0"
                          >
                            {attachingVariant ? "Attaching…" : "Attach"}
                          </button>
                        </div>
                      </div>

                      {attachVariantErr && (
                        <div className="sm:col-span-3 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-destructive">
                          {attachVariantErr}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Variants List Table */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">Active Variants in this Group</h4>
                    {(!inspectGroup.variants || inspectGroup.variants.length === 0) ? (
                      <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                        No accessory variants assigned yet. Select an accessory above to attach it as a variant.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                              <th className="px-4 py-2.5 text-left">Variant Label</th>
                              <th className="px-4 py-2.5 text-left">Product / SKU</th>
                              <th className="px-4 py-2.5 text-right">Price</th>
                              <th className="px-4 py-2.5 text-right">Cost</th>
                              <th className="px-4 py-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspectGroup.variants.map((v) => (
                              <tr key={v.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-2.5 font-semibold text-foreground">
                                  {v.variant_label || "—"}
                                </td>
                                <td className="px-4 py-2.5 text-foreground">
                                  <Link href={ROUTES.admin.inventoryAccessories} className="hover:underline text-primary font-medium">
                                    {v.product_name}
                                  </Link>
                                  <div className="font-mono text-[11px] text-muted-foreground">{v.product_code} {v.sku ? `· ${v.sku}` : ""}</div>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-foreground">₹{v.base_price}</td>
                                <td className="px-4 py-2.5 text-right text-muted-foreground">₹{v.standard_unit_cost}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleUnassignVariant(v.id)}
                                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                                    title="Unassign variant from group"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Link Finished Good Form */}
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm text-foreground">Link Group to Finished Good (e.g. Bahubali Bed)</h3>
                    </div>

                    <form onSubmit={handleLinkFg} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                      <div className="sm:col-span-2">
                        <label className="block text-muted-foreground mb-1">Select Finished Good *</label>
                        <select
                          value={linkFgId}
                          onChange={(e) => setLinkFgId(e.target.value ? Number(e.target.value) : "")}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none"
                        >
                          <option value="">-- Choose Finished Good --</option>
                          {allFinishedGoods.map((fg) => (
                            <option key={fg.id} value={fg.id}>
                              {fg.product_name} ({fg.product_code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-muted-foreground mb-1">Charge Mode</label>
                        <select
                          value={linkChargeMode}
                          onChange={(e) => setLinkChargeMode(e.target.value as "FREE" | "CHARGEABLE")}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none font-medium"
                        >
                          <option value="FREE">Free / Included (₹0 extra)</option>
                          <option value="CHARGEABLE">Chargeable (Extra add-on)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-muted-foreground mb-1">
                          {linkChargeMode === "FREE" ? "Sale Price" : "Add-on Price (₹)"}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={linkChargeMode === "FREE"}
                          value={linkChargeMode === "FREE" ? "0.00" : linkSalePrice}
                          onChange={(e) => setLinkSalePrice(e.target.value)}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none disabled:opacity-50"
                        />
                      </div>

                      <div>
                        <label className="block text-muted-foreground mb-1">Qty per FG</label>
                        <input
                          type="number"
                          step="0.01"
                          value={linkQuantity}
                          onChange={(e) => setLinkQuantity(e.target.value)}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2 sm:col-span-2 pt-4">
                        <input
                          id="link-def"
                          type="checkbox"
                          checked={linkDefaultIncluded}
                          onChange={(e) => setLinkDefaultIncluded(e.target.checked)}
                          className="h-4 w-4 rounded"
                        />
                        <label htmlFor="link-def" className="text-foreground">Pre-select group on new sales / contracts</label>
                      </div>

                      <div className="sm:col-span-1 pt-3">
                        <button
                          type="submit"
                          disabled={linkingFg || !linkFgId}
                          className="w-full h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                        >
                          {linkingFg ? "Linking…" : "Link to FG"}
                        </button>
                      </div>

                      {linkFgErr && (
                        <div className="sm:col-span-4 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-destructive">
                          {linkFgErr}
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Linked FGs List */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-foreground">Finished Goods Using this Group</h4>
                    {(!inspectGroup.linked_finished_goods || inspectGroup.linked_finished_goods.length === 0) ? (
                      <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                        No Finished Goods linked to this group yet. Select a finished good above to link it.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-border overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
                              <th className="px-4 py-2.5 text-left">Finished Good</th>
                              <th className="px-4 py-2.5 text-left">Code / SKU</th>
                              <th className="px-4 py-2.5 text-center">Charge Mode</th>
                              <th className="px-4 py-2.5 text-right">Add-on Price</th>
                              <th className="px-4 py-2.5 text-center">Qty / FG</th>
                              <th className="px-4 py-2.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inspectGroup.linked_finished_goods.map((link) => (
                              <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                                <td className="px-4 py-2.5 font-semibold text-foreground">
                                  <Link
                                    href={`/admin/inventory/finished-goods/${link.finished_good_id}`}
                                    className="hover:underline text-primary"
                                  >
                                    {link.product_name}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-muted-foreground">
                                  {link.product_code} {link.sku ? `· ${link.sku}` : ""}
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${link.charge_mode === "FREE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                                    {link.charge_mode === "FREE" ? "🎁 Free" : "🏷️ Chargeable"}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-foreground">₹{link.sale_price}</td>
                                <td className="px-4 py-2.5 text-center font-mono">{parseFloat(link.quantity).toFixed(2)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkFg(link.finished_good_id, link.id)}
                                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                                    title="Unlink from finished good"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
