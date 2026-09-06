"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, FlaskConical, Plus, Trash2, X } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listRawMaterials, quickCreateRawMaterial, type RawMaterialRow } from "@/services/inventory";
import { apiFetch } from "@/lib/api";

const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

type CreateForm = { product_code: string; name: string; base_price: string; unit_of_measure: string; category: string; subcategory: string };
type EditForm = { name: string; base_price: string; unit_of_measure: string; category: string; subcategory: string; standard_unit_cost: string; reorder_level_qty: string; barcode: string; is_active: boolean };

const BLANK: CreateForm = { product_code: "", name: "", base_price: "0.00", unit_of_measure: "SqFt", category: "", subcategory: "" };

function rowToEdit(row: RawMaterialRow): EditForm {
  return {
    name: row.product_name, base_price: row.base_price,
    unit_of_measure: row.unit_of_measure || "", category: row.category || "",
    subcategory: row.subcategory || "", standard_unit_cost: row.standard_unit_cost || "0.00",
    reorder_level_qty: row.reorder_level_qty || "0", barcode: row.barcode || "",
    is_active: row.is_active !== false,
  };
}

function StockBadge({ qty, reorder }: { qty: string; reorder: string }) {
  const q = parseFloat(qty ?? "0"), r = parseFloat(reorder ?? "0");
  const cls = q <= 0 ? "text-red-600 dark:text-red-400 font-bold" : q <= r ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-green-600 dark:text-green-400 font-semibold";
  return <span className={cls}>{q.toFixed(3)}</span>;
}

function BomBadge({ count }: { count: number }) {
  if (!count) return <span className="text-xs text-muted-foreground">—</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{count} BOM{count > 1 ? "s" : ""}</span>;
}

export default function RawMaterialsPage() {
  const [rows, setRows] = useState<RawMaterialRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState<CreateForm>(BLANK);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const [editId, setEditId] = useState<number | null>(null);
  const [ef, setEf] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRawMaterials({ q: search || undefined, page, page_size: PAGE_SIZE });
      setRows(res.results ?? []);
      setTotal(res.count ?? 0);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load."); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cf.product_code.trim() || !cf.name.trim()) { setCreateErr("Product Code and Name are required."); return; }
    setCreating(true); setCreateErr(null);
    try {
      await quickCreateRawMaterial({ product_code: cf.product_code.trim().toUpperCase(), name: cf.name.trim(), base_price: cf.base_price, unit_of_measure: cf.unit_of_measure || "SqFt", category: cf.category, subcategory: cf.subcategory });
      setCf(BLANK); setShowCreate(false); await load();
    } catch (e) { setCreateErr(e instanceof Error ? e.message : "Failed to create."); }
    finally { setCreating(false); }
  }

  async function handleSave(id: number) {
    if (!ef) return;
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/admin/inventory/raw-materials/${id}/`, { method: "PATCH", body: JSON.stringify(ef) });
      setEditId(null); await load();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    setDeleting(true); setDeleteErr(null);
    try {
      await apiFetch(`/admin/inventory/raw-materials/${id}/`, { method: "DELETE" });
      setDeleteId(null); await load();
    } catch (e) { setDeleteErr(e instanceof Error ? e.message : "Cannot delete — used in a BOM."); }
    finally { setDeleting(false); }
  }

  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const zeroStock = rows.filter((r) => parseFloat(r.physical_qty ?? "0") <= 0).length;
  const bomUsed = rows.filter((r) => (r.bom_usage_count ?? 0) > 0).length;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Raw Materials"
      subtitle="Input materials for manufacturing BOMs. Track stock, cost, reorder levels and BOM usage."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Raw Materials" },
      ]}
      statusBadge={{ label: "Admin Managed", tone: "info" as const }}
      stats={[
        { label: "Total", value: loading ? "—" : total, tone: "default" },
        { label: "Zero Stock", value: loading ? "—" : zeroStock, tone: zeroStock > 0 ? "danger" : "success" },
        { label: "In BOMs", value: loading ? "—" : bomUsed, tone: "info" },
      ]}
    >
      <div className="space-y-5">

        {/* Create form */}
        {showCreate ? (
          <form onSubmit={handleCreate} className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="mb-4 text-sm font-semibold text-primary">Create New Raw Material</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-product-code-unique" className="mb-1 block text-xs font-medium text-muted-foreground">Product Code * <span className="font-normal">(unique)</span></label>
                <input id="f-product-code-unique" value={cf.product_code} onChange={(e) => setCf((f) => ({ ...f, product_code: e.target.value.toUpperCase() }))} placeholder="RM-PLY-18MM" maxLength={40} className={INP + " font-mono"} />
              </div>
              <div>
                <label htmlFor="f-unit-of-measure" className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                <input id="f-unit-of-measure" value={cf.unit_of_measure} onChange={(e) => setCf((f) => ({ ...f, unit_of_measure: e.target.value }))} placeholder="SqFt / KG / PCS / Mtr" className={INP} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="f-material-name" className="mb-1 block text-xs font-medium text-muted-foreground">Material Name *</label>
                <input id="f-material-name" value={cf.name} onChange={(e) => setCf((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. 18mm Commercial Ply – BWR Grade" maxLength={200} className={INP} />
              </div>
              <div>
                <label htmlFor="f-purchase-price-per-unit" className="mb-1 block text-xs font-medium text-muted-foreground">Purchase Price (₹ per unit)</label>
                <input id="f-purchase-price-per-unit" type="number" min="0" step="0.01" value={cf.base_price} onChange={(e) => setCf((f) => ({ ...f, base_price: e.target.value }))} className={INP} />
              </div>
              <div>
                <label htmlFor="f-category" className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                <input id="f-category" value={cf.category} onChange={(e) => setCf((f) => ({ ...f, category: e.target.value }))} placeholder="Timber, Hardware, Fabric…" className={INP} />
              </div>
              {createErr && (
                <div className="sm:col-span-2 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{createErr}
                </div>
              )}
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={creating} className={BTN_PRIMARY}><CheckCircle className="h-3.5 w-3.5" />{creating ? "Creating…" : "Create Raw Material"}</button>
                <button type="button" onClick={() => { setShowCreate(false); setCreateErr(null); setCf(BLANK); }} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}><Plus className="h-4 w-4" />New Raw Material</button>
            <Link href={ROUTES.admin.manufacturingBoms} className={BTN_GHOST}>Manage BOMs →</Link>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code, SKU…" className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          {search && <button onClick={() => setSearch("")} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Clear</button>}
          <span className="self-center text-xs text-muted-foreground">{total} material{total === 1 ? "" : "s"}</span>
        </div>

        {/* List */}
        {loading ? <ERPLoadingState label="Loading raw materials…" /> : error ? (
          <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>
        ) : rows.length === 0 ? (
          <ERPEmptyState title="No raw materials yet" description={search ? "No materials match your search." : "Click 'New Raw Material' to add your first input material."} />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const isEditing = editId === row.id, isDeleting = deleteId === row.id;
              const qty = parseFloat(row.physical_qty ?? "0");
              const reorder = parseFloat(row.reorder_level_qty ?? "0");
              const dot = qty <= 0 ? "bg-red-500" : qty <= reorder ? "bg-amber-500" : "bg-emerald-500";
              return (
                <div key={row.id} className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
                      <FlaskConical className="h-4 w-4 shrink-0 text-orange-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{row.product_name}</span>
                        {!row.is_active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>}
                        <BomBadge count={row.bom_usage_count ?? 0} />
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono">{row.product_code}</span>
                        {row.sku ? <span>SKU: {row.sku}</span> : null}
                        <span>{row.unit_of_measure}</span>
                        {row.category ? <span>{row.category}{row.subcategory ? ` › ${row.subcategory}` : ""}</span> : null}
                      </div>
                    </div>
                    <div className="mr-2 flex shrink-0 flex-wrap gap-4 text-xs">
                      {[
                        ["Stock", <StockBadge key="s" qty={row.physical_qty} reorder={row.reorder_level_qty} />],
                        ["Reorder", <span key="r" className="text-muted-foreground">{reorder.toFixed(2)}</span>],
                        ["Purchase ₹", <span key="p">₹{row.base_price}</span>],
                        ["Std Cost", <span key="c" className="text-muted-foreground">₹{row.standard_unit_cost}</span>],
                      ].map(([label, val]) => (
                        <div key={String(label)} className="text-center">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
                          {val}
                        </div>
                      ))}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button onClick={() => { if (isEditing) { setEditId(null); return; } setEditId(row.id); setEf(rowToEdit(row)); setSaveErr(null); setDeleteId(null); }} className={BTN_GHOST}>
                        <Edit2 className="h-3.5 w-3.5" />{isEditing ? "Close" : "Edit"}
                      </button>
                      <button onClick={() => { setDeleteId(isDeleting ? null : row.id); setDeleteErr(null); setEditId(null); }} className={BTN_DANGER}>
                        <Trash2 className="h-3.5 w-3.5" />{isDeleting ? "Cancel" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Inline edit */}
                  {isEditing && ef && (
                    <div className="border-t border-border px-4 pb-5 pt-4">
                      <div className="mb-3 text-xs font-semibold text-primary">Edit Raw Material</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="f-name" className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                          <input id="f-name" value={ef.name} onChange={(e) => setEf((f) => f ? { ...f, name: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-purchase-price" className="mb-1 block text-xs font-medium text-muted-foreground">Purchase Price (₹)</label>
                          <input id="f-purchase-price" type="number" min="0" step="0.01" value={ef.base_price} onChange={(e) => setEf((f) => f ? { ...f, base_price: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-std-unit-cost-used-in-bom-costing" className="mb-1 block text-xs font-medium text-muted-foreground">Std Unit Cost (₹) <span className="font-normal text-muted-foreground">— used in BOM costing</span></label>
                          <input id="f-std-unit-cost-used-in-bom-costing" type="number" min="0" step="0.0001" value={ef.standard_unit_cost} onChange={(e) => setEf((f) => f ? { ...f, standard_unit_cost: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-unit-of-measure-2" className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                          <input id="f-unit-of-measure-2" value={ef.unit_of_measure} onChange={(e) => setEf((f) => f ? { ...f, unit_of_measure: e.target.value } : f)} placeholder="SqFt / KG / PCS / Mtr" className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-reorder-level" className="mb-1 block text-xs font-medium text-muted-foreground">Reorder Level</label>
                          <input id="f-reorder-level" type="number" min="0" step="0.001" value={ef.reorder_level_qty} onChange={(e) => setEf((f) => f ? { ...f, reorder_level_qty: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-category-2" className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                          <input id="f-category-2" value={ef.category} onChange={(e) => setEf((f) => f ? { ...f, category: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-subcategory" className="mb-1 block text-xs font-medium text-muted-foreground">Subcategory</label>
                          <input id="f-subcategory" value={ef.subcategory} onChange={(e) => setEf((f) => f ? { ...f, subcategory: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-barcode" className="mb-1 block text-xs font-medium text-muted-foreground">Barcode</label>
                          <input id="f-barcode" value={ef.barcode} onChange={(e) => setEf((f) => f ? { ...f, barcode: e.target.value } : f)} placeholder="Leave blank to clear" className={INP + " font-mono"} />
                        </div>
                        <div className="flex items-center gap-2">
                          <input id={`act-${row.id}`} type="checkbox" checked={ef.is_active} onChange={(e) => setEf((f) => f ? { ...f, is_active: e.target.checked } : f)} className="h-4 w-4 rounded border-border" />
                          <label htmlFor={`act-${row.id}`} className="text-sm">Active</label>
                        </div>
                        {saveErr && <div className="sm:col-span-2 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{saveErr}</div>}
                        <div className="sm:col-span-2 flex gap-2">
                          <button onClick={() => handleSave(row.id)} disabled={saving} className={BTN_PRIMARY}><CheckCircle className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Changes"}</button>
                          <button onClick={() => { setEditId(null); setSaveErr(null); }} className={BTN_GHOST}><X className="h-3.5 w-3.5" />Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline delete */}
                  {isDeleting && (
                    <div className="flex flex-wrap items-center gap-3 border-t border-destructive/20 bg-destructive/5 px-4 py-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="flex-1 text-sm text-destructive">
                        Delete <strong>{row.product_name}</strong>?
                        {(row.bom_usage_count ?? 0) > 0 ? ` Used in ${row.bom_usage_count} BOM(s) — deletion will be blocked.` : " This cannot be undone."}
                      </span>
                      {deleteErr && <span className="text-xs font-medium text-destructive">{deleteErr}</span>}
                      <button onClick={() => handleDelete(row.id)} disabled={deleting || (row.bom_usage_count ?? 0) > 0} className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition" title={(row.bom_usage_count ?? 0) > 0 ? "Remove from BOMs first" : ""}>
                        {deleting ? "Deleting…" : "Confirm Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {numPages > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 1} onClick={() => setPage(1)} className={BTN_GHOST}>First</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className={BTN_GHOST}>Prev</button>
              <span className="self-center px-3 text-xs">{page} / {numPages}</span>
              <button disabled={page === numPages} onClick={() => setPage((p) => p + 1)} className={BTN_GHOST}>Next</button>
              <button disabled={page === numPages} onClick={() => setPage(numPages)} className={BTN_GHOST}>Last</button>
            </div>
          </div>
        )}

        {/* Workflow */}
        <div className="rounded-xl border border-border bg-muted/20 px-5 py-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workflow</div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><span className="font-semibold text-foreground">1. Create raw materials here</span> — ply, timber, fabric, hardware, paint, foam. Set std unit cost — this feeds into BOM costing.</li>
            <li><span className="font-semibold text-foreground">2. Add to BOM</span> — go to <Link href={ROUTES.admin.manufacturingBoms} className="text-primary underline">Manufacturing → BOMs</Link> and add this material as a line with qty per unit and wastage %.</li>
            <li><span className="font-semibold text-foreground">3. Enter opening stock</span> — use Opening Stock import to set initial quantities so stock levels are accurate from day one.</li>
            <li><span className="font-semibold text-foreground">4. Std Cost matters</span> — the std unit cost here × qty per BOM line = material cost rolled into finished good valuation.</li>
          </ol>
        </div>

      </div>
    </ERPPageShell>
  );
}
