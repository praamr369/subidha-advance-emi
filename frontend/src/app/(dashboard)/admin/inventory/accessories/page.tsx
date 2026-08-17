"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, Package, Plus, Trash2, Wrench, X } from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { listAccessories, quickCreateAccessory } from "@/services/inventory";

type AccessoryRow = {
  id: number;
  product_code: string;
  name?: string;
  product_name?: string;
  base_price?: string;
  unit_of_measure?: string;
  standard_unit_cost?: string;
  reorder_level_qty?: string;
  linked_fg_count?: number;
  physical_qty?: string;
  category?: string;
  subcategory?: string;
  barcode?: string;
  is_active?: boolean;
  sku?: string;
};
import { apiFetch } from "@/lib/api";

// ─── Style tokens ─────────────────────────────────────────────────────────────
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

// ─── Types ────────────────────────────────────────────────────────────────────
type CreateForm = {
  product_code: string; name: string; base_price: string;
  unit_of_measure: string; category: string; subcategory: string;
};
type EditForm = {
  name: string; base_price: string; unit_of_measure: string;
  category: string; subcategory: string; standard_unit_cost: string;
  reorder_level_qty: string; barcode: string; is_active: boolean;
};

const BLANK_CREATE: CreateForm = {
  product_code: "", name: "", base_price: "0.00",
  unit_of_measure: "PCS", category: "", subcategory: "",
};
const rowToEditForm = (row: AccessoryRow): EditForm => ({
  name: row.product_name ?? row.name ?? "",
  base_price: row.base_price ?? "0.00",
  unit_of_measure: row.unit_of_measure ?? "PCS",
  category: row.category ?? "",
  subcategory: row.subcategory ?? "",
  standard_unit_cost: row.standard_unit_cost ?? "0.00",
  reorder_level_qty: row.reorder_level_qty ?? "0",
  barcode: row.barcode ?? "",
  is_active: row.is_active !== false,
});

// ─── Subcomponents ────────────────────────────────────────────────────────────
function StockQty({ qty, reorder }: { qty: string; reorder: string }) {
  const q = parseFloat(qty ?? "0");
  const r = parseFloat(reorder ?? "0");
  const cls = q <= 0
    ? "font-bold text-red-600 dark:text-red-400"
    : q <= r
    ? "font-semibold text-amber-600 dark:text-amber-400"
    : "font-semibold text-green-600 dark:text-green-400";
  return <span className={cls}>{q.toFixed(2)}</span>;
}

function LinkedBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      <Package className="h-3 w-3" />{count} FG{count === 1 ? "" : "s"}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccessoriesPage() {
  const [rows, setRows] = useState<AccessoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState<CreateForm>(BLANK_CREATE);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [ef, setEf] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAccessories({ q: search || undefined, page, page_size: PAGE_SIZE });
      setRows(res.results ?? []);
      setTotal(res.count ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [search]);

  // ── Create ──────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cf.product_code.trim() || !cf.name.trim()) {
      setCreateErr("Product Code and Name are required."); return;
    }
    setCreating(true); setCreateErr(null);
    try {
      await quickCreateAccessory({
        product_code: cf.product_code.trim().toUpperCase(),
        name: cf.name.trim(),
        base_price: cf.base_price,
        unit_of_measure: cf.unit_of_measure || "PCS",
        category: cf.category,
        subcategory: cf.subcategory,
      });
      setCf(BLANK_CREATE);
      setShowCreate(false);
      await load();
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Failed to create accessory.");
    } finally {
      setCreating(false);
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────
  async function handleSave(id: number) {
    if (!ef) return;
    setSaving(true); setSaveErr(null);
    try {
      await apiFetch(`/admin/inventory/accessories/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(ef),
      });
      setEditId(null);
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    setDeleting(true); setDeleteErr(null);
    try {
      await apiFetch(`/admin/inventory/accessories/${id}/`, { method: "DELETE" });
      setDeleteId(null);
      await load();
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : "Cannot delete — accessory may be linked to finished goods.");
    } finally {
      setDeleting(false);
    }
  }

  const numPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalLinked = rows.reduce((s, r) => s + (r.linked_fg_count ?? 0), 0);
  const lowStock = rows.filter((r) => parseFloat(r.physical_qty ?? "0") <= 0).length;

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title="Accessories Catalog"
      subtitle="Manage accessory items — create, edit, track stock, and see which finished goods they are linked to."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Accessories" },
      ]}
      statusBadge={{ label: "Admin Managed", tone: "info" as const }}
      stats={[
        { label: "Total Accessories", value: loading ? "—" : total, tone: "default" },
        { label: "Zero Stock", value: loading ? "—" : lowStock, tone: lowStock > 0 ? "danger" : "success" },
        { label: "Total FG Links", value: loading ? "—" : totalLinked, tone: "info" },
      ]}
    >
      <div className="space-y-5">

        {/* ── Create form ──────────────────────────────────────────────────── */}
        {showCreate ? (
          <form onSubmit={handleCreate} className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="mb-4 text-sm font-semibold text-primary">Create New Accessory</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Product Code * <span className="font-normal">(unique)</span></label>
                <input
                  value={cf.product_code}
                  onChange={(e) => setCf((f) => ({ ...f, product_code: e.target.value.toUpperCase() }))}
                  placeholder="ACC-SIDERAIL-SAG"
                  maxLength={40}
                  className={INP + " font-mono"}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                <input
                  value={cf.unit_of_measure}
                  onChange={(e) => setCf((f) => ({ ...f, unit_of_measure: e.target.value }))}
                  placeholder="PCS"
                  className={INP}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                <input
                  value={cf.name}
                  onChange={(e) => setCf((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Side Rail – Sagwan Wood"
                  maxLength={200}
                  className={INP}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Catalogue Price (₹)</label>
                <input
                  type="number" min="0" step="0.01"
                  value={cf.base_price}
                  onChange={(e) => setCf((f) => ({ ...f, base_price: e.target.value }))}
                  className={INP}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                <input
                  value={cf.category}
                  onChange={(e) => setCf((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Bed Accessory, Hardware…"
                  className={INP}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Subcategory</label>
                <input
                  value={cf.subcategory}
                  onChange={(e) => setCf((f) => ({ ...f, subcategory: e.target.value }))}
                  placeholder="Optional"
                  className={INP}
                />
              </div>
              {createErr && (
                <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{createErr}
                </div>
              )}
              <div className="sm:col-span-2 flex gap-2">
                <button type="submit" disabled={creating} className={BTN_PRIMARY}>
                  <CheckCircle className="h-3.5 w-3.5" />{creating ? "Creating…" : "Create Accessory"}
                </button>
                <button type="button" onClick={() => { setShowCreate(false); setCreateErr(null); setCf(BLANK_CREATE); }} className={BTN_GHOST}>
                  <X className="h-3.5 w-3.5" />Cancel
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button onClick={() => setShowCreate(true)} className={BTN_PRIMARY}>
              <Plus className="h-4 w-4" />New Accessory
            </button>
            <Link href={ROUTES.admin.inventoryFinishedGoods} className={BTN_GHOST}>
              ← Finished Goods
            </Link>
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, SKU…"
            className="min-w-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch("")} className={BTN_GHOST}>
              <X className="h-3.5 w-3.5" />Clear
            </button>
          )}
          <span className="self-center text-xs text-muted-foreground">{total} accessory{total === 1 ? "" : "ies"}</span>
        </div>

        {/* ── List ─────────────────────────────────────────────────────────── */}
        {loading ? (
          <ERPLoadingState label="Loading accessories…" />
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
          </div>
        ) : rows.length === 0 ? (
          <ERPEmptyState
            title="No accessories yet"
            description={search ? "No accessories match your search." : "Click 'New Accessory' to add your first item."}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((row) => {
              const isEditing = editId === row.id;
              const isDeleting = deleteId === row.id;
              const qty = parseFloat(row.physical_qty ?? "0");
              const stockTone = qty <= 0 ? "red" : qty <= parseFloat(row.reorder_level_qty ?? "0") ? "amber" : "green";
              const stockDot = stockTone === "red" ? "bg-red-500" : stockTone === "amber" ? "bg-amber-500" : "bg-emerald-500";

              return (
                <div key={row.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  {/* Main row */}
                  <div className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${stockDot}`} title={`Stock: ${qty.toFixed(2)}`} />
                      <Wrench className="h-4 w-4 shrink-0 text-amber-500" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{row.product_name ?? row.name}</span>
                        {row.is_active === false && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>
                        )}
                        <LinkedBadge count={row.linked_fg_count ?? 0} />
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-mono">{row.product_code}</span>
                        {row.sku ? <span>SKU: {row.sku}</span> : null}
                        <span>{row.unit_of_measure}</span>
                        {row.category ? <span>{row.category}{row.subcategory ? ` › ${row.subcategory}` : ""}</span> : null}
                      </div>
                    </div>

                    {/* KPIs */}
                    <div className="flex shrink-0 flex-wrap gap-4 text-xs mr-2">
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</div>
                        <StockQty qty={row.physical_qty ?? "0"} reorder={row.reorder_level_qty ?? "0"} />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reorder</div>
                        <span className="text-muted-foreground">{parseFloat(row.reorder_level_qty ?? "0").toFixed(2)}</span>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</div>
                        <span>₹{row.base_price}</span>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</div>
                        <span className="text-muted-foreground">₹{row.standard_unit_cost}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => {
                          if (isEditing) { setEditId(null); return; }
                          setEditId(row.id);
                          setEf(rowToEditForm(row));
                          setSaveErr(null);
                          setDeleteId(null);
                        }}
                        className={BTN_GHOST}
                      >
                        <Edit2 className="h-3.5 w-3.5" />{isEditing ? "Close" : "Edit"}
                      </button>
                      <button
                        onClick={() => { setDeleteId(isDeleting ? null : row.id); setDeleteErr(null); setEditId(null); }}
                        className={BTN_DANGER}
                      >
                        <Trash2 className="h-3.5 w-3.5" />{isDeleting ? "Cancel" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {isEditing && ef && (
                    <div className="border-t border-border px-4 pb-5 pt-4">
                      <div className="mb-3 text-xs font-semibold text-primary">Edit Accessory</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                          <input value={ef.name} onChange={(e) => setEf((f) => f ? { ...f, name: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Catalogue Price (₹)</label>
                          <input type="number" min="0" step="0.01" value={ef.base_price} onChange={(e) => setEf((f) => f ? { ...f, base_price: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Std Unit Cost (₹)</label>
                          <input type="number" min="0" step="0.01" value={ef.standard_unit_cost} onChange={(e) => setEf((f) => f ? { ...f, standard_unit_cost: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                          <input value={ef.unit_of_measure} onChange={(e) => setEf((f) => f ? { ...f, unit_of_measure: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Reorder Level</label>
                          <input type="number" min="0" step="0.001" value={ef.reorder_level_qty} onChange={(e) => setEf((f) => f ? { ...f, reorder_level_qty: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                          <input value={ef.category} onChange={(e) => setEf((f) => f ? { ...f, category: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Subcategory</label>
                          <input value={ef.subcategory} onChange={(e) => setEf((f) => f ? { ...f, subcategory: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">Barcode</label>
                          <input value={ef.barcode} onChange={(e) => setEf((f) => f ? { ...f, barcode: e.target.value } : f)} placeholder="Leave blank to clear" className={INP + " font-mono"} />
                        </div>
                        <div className="flex items-center gap-2">
                          <input id={`active-${row.id}`} type="checkbox" checked={ef.is_active} onChange={(e) => setEf((f) => f ? { ...f, is_active: e.target.checked } : f)} className="h-4 w-4 rounded border-border" />
                          <label htmlFor={`active-${row.id}`} className="text-sm">Active</label>
                        </div>
                        {saveErr && (
                          <div className="sm:col-span-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex gap-2">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{saveErr}
                          </div>
                        )}
                        <div className="sm:col-span-2 flex gap-2">
                          <button onClick={() => handleSave(row.id)} disabled={saving} className={BTN_PRIMARY}>
                            <CheckCircle className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save Changes"}
                          </button>
                          <button onClick={() => { setEditId(null); setSaveErr(null); }} className={BTN_GHOST}>
                            <X className="h-3.5 w-3.5" />Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline delete confirm */}
                  {isDeleting && (
                    <div className="border-t border-destructive/20 bg-destructive/5 px-4 py-3 flex flex-wrap items-center gap-3">
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="text-sm text-destructive flex-1">
                        Delete <strong>{row.product_name}</strong>?
                        {(row.linked_fg_count ?? 0) > 0
                          ? ` This accessory is linked to ${row.linked_fg_count} finished good(s). Deletion will be blocked.`
                          : " This cannot be undone."}
                      </span>
                      {deleteErr && <span className="text-xs text-destructive font-medium">{deleteErr}</span>}
                      <button
                        onClick={() => handleDelete(row.id)}
                        disabled={deleting || (row.linked_fg_count ?? 0) > 0}
                        className="rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 transition"
                        title={(row.linked_fg_count ?? 0) > 0 ? "Unlink from finished goods first" : ""}
                      >
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
            <li><span className="font-semibold text-foreground">1. Create accessories here</span> — give each a unique code, name, price and unit. Examples: Side Rail, Mattress, Headboard Bolt Set.</li>
            <li><span className="font-semibold text-foreground">2. Link to Finished Goods</span> — open a <Link href={ROUTES.admin.inventoryFinishedGoods} className="underline text-primary">Finished Good profile</Link> → Accessories tab → Create New (auto-links) or Link Existing.</li>
            <li><span className="font-semibold text-foreground">3. Set charge mode</span> — Free (bundled in sale price) or Chargeable (billed separately). Set sale price override if different from catalogue.</li>
            <li><span className="font-semibold text-foreground">4. Variant Groups</span> — if an accessory comes in variants (teak/sal/pine finish), create a Variant Group and link the group instead of individual items.</li>
          </ol>
        </div>

      </div>
    </ERPPageShell>
  );
}
