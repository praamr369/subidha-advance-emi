"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, ChevronRight, Save, X, Layers } from "lucide-react";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { request } from "@/services/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface PimOption { id: number; value: string; display_name: string; display_order: number }
interface PimAttr {
  id: number; name: string; slug: string;
  data_type: "TEXT" | "NUMBER" | "DECIMAL" | "CHOICE" | "MULTI_CHOICE" | "BOOLEAN" | "DATE";
  is_required: boolean; is_variant_defining: boolean; display_order: number;
  min_value: string | null; max_value: string | null;
  options: PimOption[];
}
interface PimSubcat { id: number; name: string; slug: string; display_order: number; attributes: PimAttr[] }
interface PimCat { id: number; name: string; slug: string; icon: string; display_order: number; subcategories: PimSubcat[]; attributes: PimAttr[] }

type Paginated<T> = { results?: T[]; count?: number } | T[];
function unwrap<T>(r: Paginated<T>): T[] { return Array.isArray(r) ? r : (r.results ?? []); }

const DATA_TYPES: PimAttr["data_type"][] = ["TEXT", "NUMBER", "DECIMAL", "CHOICE", "MULTI_CHOICE", "BOOLEAN", "DATE"];
const BASE = "/api/v1/pim";

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  return request<T>(path, opts);
}

// ── Inline forms ─────────────────────────────────────────────────────────────

function CategoryForm({ initial, onSave, onCancel }: {
  initial?: Partial<PimCat>;
  onSave: (data: Partial<PimCat>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "📦");
  const [order, setOrder] = useState(initial?.display_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name required"); return; }
    setSaving(true); setErr(null);
    try { await onSave({ name: name.trim(), icon, display_order: order }); }
    catch (ex: unknown) { setErr((ex as { message?: string })?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3 p-4 bg-muted/30 rounded-xl border">
      <div className="flex gap-2">
        <input className="w-14 rounded-lg border px-2 py-2 text-lg text-center bg-background" value={icon} onChange={e => setIcon(e.target.value)} placeholder="🏷️" maxLength={4} />
        <input required className="flex-1 rounded-lg border px-3 py-2 text-sm bg-background" placeholder="Category name" value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div>
        <input type="number" className="w-full rounded-lg border px-3 py-2 text-sm bg-background" placeholder="Display order" value={order} onChange={e => setOrder(Number(e.target.value))} />
      </div>
      <div className="flex gap-2 items-center">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
          <X className="h-3.5 w-3.5" />
        </button>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </form>
  );
}

function SubcategoryForm({ categoryId, initial, onSave, onCancel }: {
  categoryId: number;
  initial?: Partial<PimSubcat>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [order, setOrder] = useState(initial?.display_order ?? 0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name required"); return; }
    setSaving(true); setErr(null);
    try {
      if (initial?.id) {
        await api(`${BASE}/subcategories/${initial.id}/`, { method: "PATCH", body: JSON.stringify({ name: name.trim(), display_order: order }) });
      } else {
        await api(`${BASE}/subcategories/`, { method: "POST", body: JSON.stringify({ name: name.trim(), display_order: order, category: categoryId }) });
      }
      await onSave();
    } catch (ex: unknown) { setErr((ex as { message?: string })?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 p-3 bg-muted/20 rounded-lg border ml-4">
      <input required className="flex-1 min-w-[140px] rounded-lg border px-3 py-1.5 text-sm bg-background" placeholder="Subcategory name" value={name} onChange={e => setName(e.target.value)} />
      <input type="number" className="w-24 rounded-lg border px-3 py-1.5 text-sm bg-background" placeholder="Order" value={order} onChange={e => setOrder(Number(e.target.value))} />
      <button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{saving ? "…" : "Save"}</button>
      <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
      {err && <span className="text-xs text-destructive self-center">{err}</span>}
    </form>
  );
}

function AttributeForm({ categoryId, subcategoryId, initial, onSave, onCancel }: {
  categoryId: number;
  subcategoryId?: number;
  initial?: Partial<PimAttr>;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dataType, setDataType] = useState<PimAttr["data_type"]>(initial?.data_type ?? "TEXT");
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? false);
  const [isVariant, setIsVariant] = useState(initial?.is_variant_defining ?? false);
  const [order, setOrder] = useState(initial?.display_order ?? 0);
  const [minVal, setMinVal] = useState(initial?.min_value ?? "");
  const [maxVal, setMaxVal] = useState(initial?.max_value ?? "");
  // Options for CHOICE/MULTI_CHOICE
  const [optionInput, setOptionInput] = useState("");
  const [options, setOptions] = useState<PimOption[]>(initial?.options ?? []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr("Name required"); return; }
    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        data_type: dataType,
        is_required: isRequired,
        is_variant_defining: isVariant,
        display_order: order,
        min_value: minVal || null,
        max_value: maxVal || null,
        category: categoryId,
        subcategory: subcategoryId ?? null,
      };
      if (initial?.id) {
        await api(`${BASE}/attributes/${initial.id}/`, { method: "PATCH", body: JSON.stringify(body) });
        // save new options
        for (const opt of options) {
          if (!opt.id) {
            await api(`${BASE}/attribute-options/`, { method: "POST", body: JSON.stringify({ value: opt.value, display_name: opt.display_name, display_order: opt.display_order, attribute: initial.id }) }).catch(() => {});
          }
        }
      } else {
        const created = await api<{ id: number }>(`${BASE}/attributes/`, { method: "POST", body: JSON.stringify(body) });
        // save options for new attribute
        for (let i = 0; i < options.length; i++) {
          await api(`${BASE}/attribute-options/`, { method: "POST", body: JSON.stringify({ value: options[i].value, display_name: options[i].display_name, display_order: i, attribute: created.id }) }).catch(() => {});
        }
      }
      await onSave();
    } catch (ex: unknown) { setErr((ex as { message?: string })?.message ?? "Save failed"); }
    finally { setSaving(false); }
  }

  function addOption() {
    const v = optionInput.trim();
    if (!v || options.some(o => o.value === v)) return;
    setOptions(prev => [...prev, { id: 0, value: v, display_name: v, display_order: prev.length }]);
    setOptionInput("");
  }

  const needsOptions = dataType === "CHOICE" || dataType === "MULTI_CHOICE";
  const needsRange = dataType === "NUMBER" || dataType === "DECIMAL";

  return (
    <form onSubmit={submit} className="p-4 bg-muted/20 rounded-xl border space-y-3 ml-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Attribute Name *</label>
          <input required className="w-full rounded-lg border px-3 py-2 text-sm bg-background" placeholder="e.g. Material, Color, Storage" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Data Type</label>
          <select className="w-full rounded-lg border px-3 py-2 text-sm bg-background" value={dataType} onChange={e => setDataType(e.target.value as PimAttr["data_type"])}>
            {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {needsRange && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="block text-xs font-medium mb-1 text-muted-foreground">Min Value</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm bg-background" value={minVal} onChange={e => setMinVal(e.target.value)} /></div>
          <div><label className="block text-xs font-medium mb-1 text-muted-foreground">Max Value</label><input type="number" className="w-full rounded-lg border px-3 py-2 text-sm bg-background" value={maxVal} onChange={e => setMaxVal(e.target.value)} /></div>
        </div>
      )}

      {needsOptions && (
        <div>
          <label className="block text-xs font-medium mb-1 text-muted-foreground">Options</label>
          <div className="flex gap-2 mb-2">
            <input className="flex-1 rounded-lg border px-3 py-1.5 text-sm bg-background" placeholder="Add option value" value={optionInput} onChange={e => setOptionInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addOption())} />
            <button type="button" onClick={addOption} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">Add</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-0.5 text-xs">
                {opt.display_name}
                <button type="button" onClick={() => setOptions(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-primary" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" className="accent-primary" checked={isVariant} onChange={e => setIsVariant(e.target.checked)} />
          Variant-defining (creates separate SKUs)
        </label>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Order</label>
          <input type="number" className="w-16 rounded-lg border px-2 py-1 text-sm bg-background" value={order} onChange={e => setOrder(Number(e.target.value))} />
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
          <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : initial?.id ? "Update Attribute" : "Add Attribute"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PimCategoryManagePage() {
  const [categories, setCategories] = useState<PimCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());

  // Forms state
  const [showNewCat, setShowNewCat] = useState(false);
  const [editingCat, setEditingCat] = useState<number | null>(null);
  const [addSubcatFor, setAddSubcatFor] = useState<number | null>(null);
  const [editSubcat, setEditSubcat] = useState<{ catId: number; sub: PimSubcat } | null>(null);
  const [addAttrFor, setAddAttrFor] = useState<{ catId: number; subcatId?: number } | null>(null);
  const [editAttr, setEditAttr] = useState<{ catId: number; attr: PimAttr } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await api<Paginated<PimCat>>(`${BASE}/categories/?page_size=200`);
      setCategories(unwrap(raw));
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveCategory(data: Partial<PimCat>, id?: number) {
    if (id) {
      await api(`${BASE}/categories/${id}/`, { method: "PATCH", body: JSON.stringify(data) });
    } else {
      await api(`${BASE}/categories/`, { method: "POST", body: JSON.stringify(data) });
    }
    await load();
    setShowNewCat(false);
    setEditingCat(null);
  }

  async function deleteCategory(id: number) {
    if (!confirm("Delete this category? This will also delete all subcategories and attributes.")) return;
    await api(`${BASE}/categories/${id}/`, { method: "DELETE" });
    await load();
  }

  async function deleteSubcat(id: number) {
    if (!confirm("Delete this subcategory?")) return;
    await api(`${BASE}/subcategories/${id}/`, { method: "DELETE" });
    await load();
  }

  async function deleteAttr(id: number) {
    if (!confirm("Delete this attribute?")) return;
    await api(`${BASE}/attributes/${id}/`, { method: "DELETE" });
    await load();
  }

  function toggleCat(id: number) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const TYPE_COLORS: Record<string, string> = {
    TEXT: "bg-slate-100 text-slate-700",
    NUMBER: "bg-blue-100 text-blue-700",
    DECIMAL: "bg-cyan-100 text-cyan-700",
    CHOICE: "bg-purple-100 text-purple-700",
    MULTI_CHOICE: "bg-violet-100 text-violet-700",
    BOOLEAN: "bg-amber-100 text-amber-700",
    DATE: "bg-green-100 text-green-700",
  };

  return (
    <ERPPageShell
      eyebrow="PIM"
      title="Manage PIM Categories"
      subtitle="Create and edit product categories, subcategories, and attribute templates."
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "PIM Categories", href: "/admin/pim/categories" },
        { label: "Manage" },
      ]}
      actions={[
        { href: "/admin/pim/categories", label: "View Overview", variant: "secondary" },
        { href: "/admin/pim/products", label: "PIM Products", variant: "secondary" },
      ]}
      statusBadge={{ label: "Category Editor", tone: "info" }}
    >
      <div className="space-y-4">
        {/* New category button */}
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">{categories.length} categories</p>
          <button
            type="button"
            onClick={() => setShowNewCat(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New Category
          </button>
        </div>

        {showNewCat && (
          <CategoryForm onSave={(d) => saveCategory(d)} onCancel={() => setShowNewCat(false)} />
        )}

        {loading ? <ERPLoadingState label="Loading categories…" /> : null}

        {!loading && categories.length === 0 && !showNewCat && (
          <div className="rounded-xl border-2 border-dashed p-12 text-center">
            <Layers className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No PIM categories yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click "New Category" to create your first product category.</p>
          </div>
        )}

        {categories.map((cat) => {
          const expanded = expandedCats.has(cat.id);
          const allAttrs = [...cat.attributes, ...cat.subcategories.flatMap(s => s.attributes)];

          return (
            <div key={cat.id} className="rounded-xl border bg-background overflow-hidden">
              {/* Category header */}
              {editingCat === cat.id ? (
                <div className="p-4">
                  <CategoryForm
                    initial={cat}
                    onSave={(d) => saveCategory(d, cat.id)}
                    onCancel={() => setEditingCat(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                  <button type="button" onClick={() => toggleCat(cat.id)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
                    <span className="text-lg">{cat.icon}</span>
                    <span className="font-semibold text-sm">{cat.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {cat.subcategories.length} subcats · {allAttrs.length} attributes
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => { setAddAttrFor({ catId: cat.id }); setExpandedCats(p => new Set([...p, cat.id])); }} title="Add attribute to category" className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Attribute
                    </button>
                    <button type="button" onClick={() => { setAddSubcatFor(cat.id); setExpandedCats(p => new Set([...p, cat.id])); }} title="Add subcategory" className="rounded-lg border px-2 py-1.5 text-xs hover:bg-muted flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Subcat
                    </button>
                    <button type="button" onClick={() => setEditingCat(cat.id)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => deleteCategory(cat.id)} className="rounded-lg p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}

              {expanded && (
                <div className="px-4 pb-4 space-y-3 pt-2">
                  {/* Category-level attributes */}
                  {cat.attributes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Category Attributes</p>
                      <div className="space-y-1">
                        {cat.attributes.map((attr) => (
                          editAttr?.attr.id === attr.id ? (
                            <AttributeForm key={attr.id} categoryId={cat.id} initial={attr} onSave={async () => { await load(); setEditAttr(null); }} onCancel={() => setEditAttr(null)} />
                          ) : (
                            <div key={attr.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
                              <span className="text-sm font-medium flex-1">{attr.name}</span>
                              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_COLORS[attr.data_type] ?? ""}`}>{attr.data_type}</span>
                              {attr.is_required && <span className="text-xs text-amber-600 font-medium">Required</span>}
                              {attr.is_variant_defining && <span className="text-xs text-primary font-medium">Variant</span>}
                              {attr.options.length > 0 && <span className="text-xs text-muted-foreground">{attr.options.length} opts</span>}
                              <button type="button" onClick={() => setEditAttr({ catId: cat.id, attr })} className="p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                              <button type="button" onClick={() => deleteAttr(attr.id)} className="p-1 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Add attribute at category level */}
                  {addAttrFor?.catId === cat.id && !addAttrFor.subcatId && (
                    <AttributeForm categoryId={cat.id} onSave={async () => { await load(); setAddAttrFor(null); }} onCancel={() => setAddAttrFor(null)} />
                  )}

                  {/* Subcategories */}
                  {cat.subcategories.map((sub) => (
                    <div key={sub.id} className="rounded-lg border ml-2">
                      {editSubcat?.sub.id === sub.id ? (
                        <SubcategoryForm categoryId={cat.id} initial={sub} onSave={async () => { await load(); setEditSubcat(null); }} onCancel={() => setEditSubcat(null)} />
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/10">
                          <span className="text-sm font-medium flex-1">{sub.name}</span>
                          <span className="text-xs text-muted-foreground">{sub.attributes.length} attributes</span>
                          <button type="button" onClick={() => setAddAttrFor({ catId: cat.id, subcatId: sub.id })} className="rounded border px-2 py-1 text-xs hover:bg-muted flex items-center gap-1"><Plus className="h-3 w-3" /> Attr</button>
                          <button type="button" onClick={() => setEditSubcat({ catId: cat.id, sub })} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={() => deleteSubcat(sub.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}

                      {/* Subcategory attributes */}
                      {sub.attributes.length > 0 && (
                        <div className="px-3 pb-2 pt-1 space-y-1">
                          {sub.attributes.map((attr) => (
                            editAttr?.attr.id === attr.id ? (
                              <AttributeForm key={attr.id} categoryId={cat.id} subcategoryId={sub.id} initial={attr} onSave={async () => { await load(); setEditAttr(null); }} onCancel={() => setEditAttr(null)} />
                            ) : (
                              <div key={attr.id} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5">
                                <span className="text-sm flex-1">{attr.name}</span>
                                <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${TYPE_COLORS[attr.data_type] ?? ""}`}>{attr.data_type}</span>
                                {attr.is_required && <span className="text-xs text-amber-600">Required</span>}
                                {attr.is_variant_defining && <span className="text-xs text-primary">Variant</span>}
                                <button type="button" onClick={() => setEditAttr({ catId: cat.id, attr })} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                                <button type="button" onClick={() => deleteAttr(attr.id)} className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            )
                          ))}
                        </div>
                      )}

                      {/* Add attribute to subcategory */}
                      {addAttrFor?.catId === cat.id && addAttrFor.subcatId === sub.id && (
                        <div className="px-3 pb-3">
                          <AttributeForm categoryId={cat.id} subcategoryId={sub.id} onSave={async () => { await load(); setAddAttrFor(null); }} onCancel={() => setAddAttrFor(null)} />
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Add subcategory form */}
                  {addSubcatFor === cat.id && (
                    <SubcategoryForm categoryId={cat.id} onSave={async () => { await load(); setAddSubcatFor(null); }} onCancel={() => setAddSubcatFor(null)} />
                  )}

                  {/* Quick-add buttons at bottom */}
                  {addSubcatFor !== cat.id && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setAddSubcatFor(cat.id)} className="text-xs text-primary hover:underline flex items-center gap-1">
                        <Plus className="h-3 w-3" /> Add Subcategory
                      </button>
                      {addAttrFor?.catId !== cat.id && (
                        <button type="button" onClick={() => setAddAttrFor({ catId: cat.id })} className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Add Category Attribute
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ERPPageShell>
  );
}
