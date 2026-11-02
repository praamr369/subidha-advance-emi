"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Edit2,
  ExternalLink,
  Layers,
  Package,
  Plus,
  QrCode,
  Save,
  Trash2,
  Wrench,
  X,
} from "lucide-react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import { ROUTES } from "@/lib/routes";
import { apiFetch } from "@/lib/api";
import QRCode from "react-qr-code";
import {
  listAccessories,
  quickCreateAccessory,
  listAccessoryVariantGroups,
  listFinishedGoods,
  addFGAccessoryLink,
  deleteFGAccessoryLink,
  getAccessoryDetail,
  assignAccessoryVariantGroup,
  type AccessoryRow,
  type AccessoryVariantGroup,
  type FinishedGoodRow,
  type AccessoryLinkedFG,
} from "@/services/inventory";

// ─── Style tokens ─────────────────────────────────────────────────────────────
const INP = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const SEL = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const BTN_PRIMARY = "inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition";
const BTN_GHOST = "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-50 transition";
const BTN_DANGER = "inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition";

// ─── Types ────────────────────────────────────────────────────────────────────
type CreateForm = {
  product_code: string;
  name: string;
  base_price: string;
  standard_unit_cost: string;
  reorder_level_qty: string;
  unit_of_measure: string;
  category: string;
  subcategory: string;
  variant_group: number | "";
  variant_label: string;
};

type EditForm = {
  name: string;
  base_price: string;
  unit_of_measure: string;
  category: string;
  subcategory: string;
  standard_unit_cost: string;
  reorder_level_qty: string;
  barcode: string;
  is_active: boolean;
};

const BLANK_CREATE: CreateForm = {
  product_code: "",
  name: "",
  base_price: "0.00",
  standard_unit_cost: "0.00",
  reorder_level_qty: "0",
  unit_of_measure: "PCS",
  category: "",
  subcategory: "",
  variant_group: "",
  variant_label: "",
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

function LinkedBadge({ count, onClick }: { count: number; onClick?: () => void }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      title="View linked finished goods"
      className="inline-flex items-center gap-1 rounded-full bg-blue-100 hover:bg-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 transition-colors"
    >
      <Package className="h-3 w-3" />{count} FG{count === 1 ? "" : "s"}
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AccessoriesPage() {
  const [rows, setRows] = useState<AccessoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Variant groups and FG references for selection
  const [variantGroups, setVariantGroups] = useState<AccessoryVariantGroup[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<FinishedGoodRow[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [cf, setCf] = useState<CreateForm>(BLANK_CREATE);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Quick inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [ef, setEf] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Profile workbench drawer (like finished goods profile)
  const [activeProfileAcc, setActiveProfileAcc] = useState<AccessoryRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<"overview" | "variant_group" | "linked_fgs">("overview");

  // Profile Drawer: Variant Group assignment form
  const [vgSelection, setVgSelection] = useState<number | "">("");
  const [vgLabelInput, setVgLabelInput] = useState("");
  const [savingVg, setSavingVg] = useState(false);
  const [vgMsg, setVgMsg] = useState<string | null>(null);

  // Profile Drawer: Attach to Finished Good form
  const [selectedFgId, setSelectedFgId] = useState<number | "">("");
  const [fgChargeMode, setFgChargeMode] = useState<"FREE" | "CHARGEABLE">("FREE");
  const [fgSalePrice, setFgSalePrice] = useState("0.00");
  const [fgQuantity, setFgQuantity] = useState("1.00");
  const [fgDefaultInc, setFgDefaultInc] = useState(true);
  const [linkingFg, setLinkingFg] = useState(false);
  const [linkFgErr, setLinkFgErr] = useState<string | null>(null);

  // Load accessory catalog
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAccessories({ q: search || undefined, page, page_size: PAGE_SIZE });
      setRows(res.results ?? []);
      setTotal(res.count ?? 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accessories.");
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  // Load variant groups & finished goods for dropdowns
  const loadLookups = useCallback(async () => {
    try {
      const [vgRes, fgRes] = await Promise.all([
        listAccessoryVariantGroups({ page_size: 100 }),
        listFinishedGoods({ page_size: 100 }),
      ]);
      setVariantGroups(vgRes.results ?? []);
      setFinishedGoods(fgRes.results ?? []);
    } catch {
      // Non-fatal fallback
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadLookups(); }, [loadLookups]);
  useEffect(() => { setPage(1); }, [search]);

  // Open profile drawer
  const openProfile = async (row: AccessoryRow, tab: "overview" | "variant_group" | "linked_fgs" = "overview") => {
    setProfileTab(tab);
    setProfileLoading(true);
    setLinkFgErr(null);
    setVgMsg(null);
    try {
      const detail = await getAccessoryDetail(row.id);
      setActiveProfileAcc(detail);
      setVgSelection(detail.variant_group ?? "");
      setVgLabelInput(detail.variant_label ?? "");
      setEf(rowToEditForm(detail));
    } catch {
      setActiveProfileAcc(row);
      setVgSelection(row.variant_group ?? "");
      setVgLabelInput(row.variant_label ?? "");
      setEf(rowToEditForm(row));
    } finally {
      setProfileLoading(false);
    }
  };

  const closeProfile = () => {
    setActiveProfileAcc(null);
    load();
  };

  // ── Create Accessory ────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!cf.product_code.trim() || !cf.name.trim()) {
      setCreateErr("Product Code and Name are required.");
      return;
    }
    setCreating(true);
    setCreateErr(null);
    try {
      await quickCreateAccessory({
        product_code: cf.product_code.trim().toUpperCase(),
        name: cf.name.trim(),
        base_price: cf.base_price,
        unit_of_measure: cf.unit_of_measure || "PCS",
        category: cf.category,
        subcategory: cf.subcategory,
        standard_unit_cost: cf.standard_unit_cost || "0.00",
        reorder_level_qty: cf.reorder_level_qty || "0",
        variant_group: cf.variant_group ? Number(cf.variant_group) : null,
        variant_label: cf.variant_label.trim(),
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

  // ── Inline Edit Save ────────────────────────────────────────────────────────
  async function handleSave(id: number) {
    if (!ef) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await apiFetch(`/admin/inventory/accessories/${id}/`, {
        method: "PATCH",
        body: JSON.stringify(ef),
      });
      setEditId(null);
      if (activeProfileAcc && activeProfileAcc.id === id) {
        openProfile({ ...activeProfileAcc, ...ef }, profileTab);
      }
      await load();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Assign Variant Group from Profile Drawer ─────────────────────────────────
  async function handleSaveVariantGroup() {
    if (!activeProfileAcc) return;
    setSavingVg(true);
    setVgMsg(null);
    try {
      await assignAccessoryVariantGroup(activeProfileAcc.id, {
        variant_group: vgSelection ? Number(vgSelection) : null,
        variant_label: vgLabelInput.trim(),
      });
      setVgMsg("Variant group mapping saved successfully.");
      const updated = await getAccessoryDetail(activeProfileAcc.id);
      setActiveProfileAcc(updated);
      await load();
    } catch (e) {
      setVgMsg(e instanceof Error ? e.message : "Failed to update variant group.");
    } finally {
      setSavingVg(false);
    }
  }

  // ── Attach to Finished Good from Profile Drawer ──────────────────────────────
  async function handleAttachToFg(e: React.FormEvent) {
    e.preventDefault();
    if (!activeProfileAcc || !selectedFgId) {
      setLinkFgErr("Please select a finished good.");
      return;
    }
    setLinkingFg(true);
    setLinkFgErr(null);
    try {
      await addFGAccessoryLink(Number(selectedFgId), {
        accessory: activeProfileAcc.id,
        charge_mode: fgChargeMode,
        sale_price: fgChargeMode === "FREE" ? "0.00" : fgSalePrice,
        quantity: fgQuantity,
        is_default_included: fgDefaultInc,
      });
      setSelectedFgId("");
      setFgSalePrice("0.00");
      setFgQuantity("1.00");
      const updated = await getAccessoryDetail(activeProfileAcc.id);
      setActiveProfileAcc(updated);
      await load();
    } catch (e) {
      setLinkFgErr(e instanceof Error ? e.message : "Failed to link finished good.");
    } finally {
      setLinkingFg(false);
    }
  }

  // ── Unlink from Finished Good from Profile Drawer ───────────────────────────
  async function handleUnlinkFg(fgId: number, linkId: number) {
    if (!confirm("Unlink this accessory from the finished good?")) return;
    try {
      await deleteFGAccessoryLink(fgId, linkId);
      if (activeProfileAcc) {
        const updated = await getAccessoryDetail(activeProfileAcc.id);
        setActiveProfileAcc(updated);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to unlink finished good.");
    }
  }

  // ── Delete Accessory ────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    setDeleting(true);
    setDeleteErr(null);
    try {
      await apiFetch(`/admin/inventory/accessories/${id}/`, { method: "DELETE" });
      setDeleteId(null);
      if (activeProfileAcc?.id === id) closeProfile();
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
      subtitle="Manage accessory items — create, assign variant groups, track stock, and link to Finished Goods (e.g. Bahubali Bed)."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Accessories" },
      ]}
      actions={[
        { label: "Finished Goods", href: ROUTES.admin.inventoryFinishedGoods, variant: "secondary" as const },
        { label: "Variant Groups", href: ROUTES.admin.inventoryAccessoryVariantGroups, variant: "secondary" as const },
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
          <form onSubmit={handleCreate} className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-primary/10">
              <span className="text-sm font-semibold text-primary">Create New Accessory &amp; Map to Variant Group</span>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateErr(null); setCf(BLANK_CREATE); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="f-product-code-unique" className="mb-1 block text-xs font-medium text-muted-foreground">Product Code * <span className="font-normal">(unique)</span></label>
                <input
                  id="f-product-code-unique"
                  value={cf.product_code}
                  onChange={(e) => setCf((f) => ({ ...f, product_code: e.target.value.toUpperCase() }))}
                  placeholder="ACC-SIDERAIL-SAG"
                  maxLength={40}
                  className={INP + " font-mono"}
                />
              </div>

              <div>
                <label htmlFor="f-unit-of-measure" className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                <input
                  id="f-unit-of-measure"
                  value={cf.unit_of_measure}
                  onChange={(e) => setCf((f) => ({ ...f, unit_of_measure: e.target.value }))}
                  placeholder="PCS"
                  className={INP}
                />
              </div>

              <div>
                <label htmlFor="f-name" className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                <input
                  id="f-name"
                  value={cf.name}
                  onChange={(e) => setCf((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Side Rail – Sagwan Wood"
                  maxLength={200}
                  className={INP}
                />
              </div>

              {/* Variant Group Selection */}
              <div>
                <label htmlFor="f-variant-group-select" className="mb-1 block text-xs font-medium text-primary flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Accessory Variant Group
                </label>
                <select
                  id="f-variant-group-select"
                  value={cf.variant_group}
                  onChange={(e) => setCf((f) => ({ ...f, variant_group: e.target.value ? Number(e.target.value) : "" }))}
                  className={SEL + " font-medium"}
                >
                  <option value="">— Standalone Accessory (No Variant Group) —</option>
                  {variantGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="f-variant-label" className="mb-1 block text-xs font-medium text-muted-foreground">Variant Label <span className="font-normal">(e.g. Sagwan Wood 6ft)</span></label>
                <input
                  id="f-variant-label"
                  value={cf.variant_label}
                  onChange={(e) => setCf((f) => ({ ...f, variant_label: e.target.value }))}
                  placeholder="e.g. Sagwan 6ft / Teak 6ft"
                  className={INP}
                />
              </div>

              <div>
                <label htmlFor="f-catalogue-price" className="mb-1 block text-xs font-medium text-muted-foreground">Catalogue Price (₹)</label>
                <input
                  id="f-catalogue-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cf.base_price}
                  onChange={(e) => setCf((f) => ({ ...f, base_price: e.target.value }))}
                  className={INP}
                />
              </div>

              <div>
                <label htmlFor="f-std-cost-create" className="mb-1 block text-xs font-medium text-muted-foreground">Std Unit Cost (₹)</label>
                <input
                  id="f-std-cost-create"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cf.standard_unit_cost}
                  onChange={(e) => setCf((f) => ({ ...f, standard_unit_cost: e.target.value }))}
                  placeholder="0.00"
                  className={INP}
                />
              </div>

              <div>
                <label htmlFor="f-reorder-create" className="mb-1 block text-xs font-medium text-muted-foreground">Reorder Level Qty</label>
                <input
                  id="f-reorder-create"
                  type="number"
                  min="0"
                  step="0.001"
                  value={cf.reorder_level_qty}
                  onChange={(e) => setCf((f) => ({ ...f, reorder_level_qty: e.target.value }))}
                  placeholder="0"
                  className={INP}
                />
              </div>

              <div>
                <label htmlFor="f-category" className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
                <input
                  id="f-category"
                  value={cf.category}
                  onChange={(e) => setCf((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Bed Accessory, Hardware…"
                  className={INP}
                />
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="f-subcategory" className="mb-1 block text-xs font-medium text-muted-foreground">Subcategory</label>
                <input
                  id="f-subcategory"
                  value={cf.subcategory}
                  onChange={(e) => setCf((f) => ({ ...f, subcategory: e.target.value }))}
                  placeholder="Optional, e.g. Rails, Headboards"
                  className={INP}
                />
              </div>

              {createErr && (
                <div className="sm:col-span-3 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive flex gap-2 items-start">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{createErr}
                </div>
              )}

              <div className="sm:col-span-3 flex gap-2 pt-2">
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
            <Link href={ROUTES.admin.inventoryAccessoryVariantGroups} className={BTN_GHOST}>
              Variant Groups →
            </Link>
          </div>
        )}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, SKU, group…"
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
                <div key={row.id} className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-xs">
                  {/* Main row */}
                  <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${stockDot}`} title={`Stock: ${qty.toFixed(2)}`} />
                      <Wrench className="h-4 w-4 shrink-0 text-amber-500" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{row.product_name ?? row.name}</span>
                        {row.is_active === false && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>
                        )}

                        {/* Variant Group Badge */}
                        {row.variant_group ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                            <Layers className="h-3 w-3" />
                            {row.variant_group_name || row.variant_group_code}
                            {row.variant_label ? ` · ${row.variant_label}` : ""}
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Standalone</span>
                        )}

                        <LinkedBadge count={row.linked_fg_count ?? 0} onClick={() => openProfile(row, "linked_fgs")} />
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
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</div>
                        <span>₹{row.base_price}</span>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</div>
                        <span className="text-muted-foreground">₹{row.standard_unit_cost}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openProfile(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                        title="Manage complete profile, variant groups, and finished goods links"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Profile &amp; Links
                      </button>

                      <button
                        type="button"
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
                        type="button"
                        onClick={() => { setDeleteId(isDeleting ? null : row.id); setDeleteErr(null); setEditId(null); }}
                        className={BTN_DANGER}
                      >
                        <Trash2 className="h-3.5 w-3.5" />{isDeleting ? "Cancel" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {/* Inline quick edit panel */}
                  {isEditing && ef && (
                    <div className="border-t border-border px-4 pb-5 pt-4 bg-muted/10">
                      <div className="mb-3 text-xs font-semibold text-primary">Quick Edit Accessory</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="f-name-2" className="mb-1 block text-xs font-medium text-muted-foreground">Name *</label>
                          <input id="f-name-2" value={ef.name} onChange={(e) => setEf((f) => f ? { ...f, name: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-catalogue-price-2" className="mb-1 block text-xs font-medium text-muted-foreground">Catalogue Price (₹)</label>
                          <input id="f-catalogue-price-2" type="number" min="0" step="0.01" value={ef.base_price} onChange={(e) => setEf((f) => f ? { ...f, base_price: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-std-unit-cost" className="mb-1 block text-xs font-medium text-muted-foreground">Std Unit Cost (₹)</label>
                          <input id="f-std-unit-cost" type="number" min="0" step="0.01" value={ef.standard_unit_cost} onChange={(e) => setEf((f) => f ? { ...f, standard_unit_cost: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-unit-of-measure-2" className="mb-1 block text-xs font-medium text-muted-foreground">Unit of Measure</label>
                          <input id="f-unit-of-measure-2" value={ef.unit_of_measure} onChange={(e) => setEf((f) => f ? { ...f, unit_of_measure: e.target.value } : f)} className={INP} />
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
                          <label htmlFor="f-subcategory-2" className="mb-1 block text-xs font-medium text-muted-foreground">Subcategory</label>
                          <input id="f-subcategory-2" value={ef.subcategory} onChange={(e) => setEf((f) => f ? { ...f, subcategory: e.target.value } : f)} className={INP} />
                        </div>
                        <div>
                          <label htmlFor="f-barcode" className="mb-1 block text-xs font-medium text-muted-foreground">Barcode</label>
                          <input id="f-barcode" value={ef.barcode} onChange={(e) => setEf((f) => f ? { ...f, barcode: e.target.value } : f)} placeholder="Leave blank to clear" className={INP + " font-mono"} />
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

        {/* ── Full Profile & Links Workbench Drawer (Like Finished Goods Profile) ── */}
        {activeProfileAcc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
            <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-amber-500" />
                    <h2 className="text-lg font-bold text-foreground truncate">
                      {activeProfileAcc.product_name || activeProfileAcc.name}
                    </h2>
                    {activeProfileAcc.is_active === false && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">Inactive</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span className="font-mono">Code: {activeProfileAcc.product_code}</span>
                    {activeProfileAcc.sku && <span>SKU: {activeProfileAcc.sku}</span>}
                    <span>Unit: {activeProfileAcc.unit_of_measure}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeProfile}
                  className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Tab Navigation */}
              <div className="flex border-b border-border bg-muted/10 px-6">
                <button
                  type="button"
                  onClick={() => setProfileTab("overview")}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${profileTab === "overview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  1. Overview &amp; Stock
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab("variant_group")}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${profileTab === "variant_group" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Layers className="h-4 w-4" /> 2. Variant Group Mapping
                </button>
                <button
                  type="button"
                  onClick={() => setProfileTab("linked_fgs")}
                  className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${profileTab === "linked_fgs" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Package className="h-4 w-4" /> 3. Linked Finished Goods ({activeProfileAcc.linked_finished_goods?.length ?? activeProfileAcc.linked_fg_count ?? 0})
                </button>
              </div>

              {/* Tab Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {profileLoading ? (
                  <ERPLoadingState label="Loading accessory profile…" />
                ) : profileTab === "overview" ? (
                  <div className="space-y-6">
                    {/* Key Stats Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="rounded-xl border border-border bg-card p-4 text-center">
                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Physical Stock</div>
                        <div className="text-xl font-bold mt-1">
                          <StockQty qty={activeProfileAcc.physical_qty ?? "0"} reorder={activeProfileAcc.reorder_level_qty ?? "0"} />
                          <span className="text-xs font-normal text-muted-foreground ml-1">{activeProfileAcc.unit_of_measure}</span>
                        </div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4 text-center">
                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Reorder Level</div>
                        <div className="text-xl font-bold mt-1 text-foreground">{parseFloat(activeProfileAcc.reorder_level_qty ?? "0").toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4 text-center">
                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Catalogue Price</div>
                        <div className="text-xl font-bold mt-1 text-foreground">₹{activeProfileAcc.base_price}</div>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-4 text-center">
                        <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Std Unit Cost</div>
                        <div className="text-xl font-bold mt-1 text-foreground">₹{activeProfileAcc.standard_unit_cost}</div>
                      </div>
                    </div>

                    {/* QR Code and Quick Edit Form */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center text-center">
                        <div className="bg-white p-3 rounded-lg shadow-xs border">
                          <QRCode value={activeProfileAcc.barcode || activeProfileAcc.product_code} size={110} />
                        </div>
                        <div className="mt-3 font-mono text-xs text-foreground font-semibold">
                          {activeProfileAcc.barcode || activeProfileAcc.product_code}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">Asset / Inventory Barcode</div>
                      </div>

                      {ef && (
                        <div className="md:col-span-2 rounded-xl border border-border bg-card p-5 space-y-4">
                          <h3 className="font-semibold text-sm text-foreground">Accessory Details &amp; Costing</h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="sm:col-span-2">
                              <label className="block text-muted-foreground mb-1">Item Name</label>
                              <input value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} className={INP} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Catalogue Price (₹)</label>
                              <input type="number" step="0.01" value={ef.base_price} onChange={(e) => setEf({ ...ef, base_price: e.target.value })} className={INP} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Standard Unit Cost (₹)</label>
                              <input type="number" step="0.01" value={ef.standard_unit_cost} onChange={(e) => setEf({ ...ef, standard_unit_cost: e.target.value })} className={INP} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Reorder Threshold Qty</label>
                              <input type="number" step="0.001" value={ef.reorder_level_qty} onChange={(e) => setEf({ ...ef, reorder_level_qty: e.target.value })} className={INP} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Barcode / Serial</label>
                              <input value={ef.barcode} onChange={(e) => setEf({ ...ef, barcode: e.target.value })} className={INP + " font-mono"} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Category</label>
                              <input value={ef.category} onChange={(e) => setEf({ ...ef, category: e.target.value })} className={INP} />
                            </div>
                            <div>
                              <label className="block text-muted-foreground mb-1">Subcategory</label>
                              <input value={ef.subcategory} onChange={(e) => setEf({ ...ef, subcategory: e.target.value })} className={INP} />
                            </div>
                            <div className="flex items-center gap-2 sm:col-span-2 pt-1">
                              <input id="ef-active" type="checkbox" checked={ef.is_active} onChange={(e) => setEf({ ...ef, is_active: e.target.checked })} className="h-4 w-4 rounded" />
                              <label htmlFor="ef-active" className="text-foreground text-sm">Item is active for billing &amp; production</label>
                            </div>
                          </div>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => handleSave(activeProfileAcc.id)}
                              disabled={saving}
                              className={BTN_PRIMARY}
                            >
                              <Save className="h-4 w-4" />{saving ? "Saving…" : "Save Item Overview"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : profileTab === "variant_group" ? (
                  <div className="space-y-5 max-w-xl">
                    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                      <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-primary" />
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">Accessory Variant Group</h3>
                          <p className="text-xs text-muted-foreground">
                            When grouped (e.g. into &quot;Side Rails&quot; or &quot;Bahubali Accessories&quot;), finished goods can link to the group and allow selecting this item as a variant at billing.
                          </p>
                        </div>
                      </div>

                      {vgMsg && (
                        <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary">
                          {vgMsg}
                        </div>
                      )}

                      <div className="space-y-3 pt-2">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">
                            Assign to Variant Group
                          </label>
                          <select
                            value={vgSelection}
                            onChange={(e) => setVgSelection(e.target.value ? Number(e.target.value) : "")}
                            className={SEL}
                          >
                            <option value="">— Standalone Accessory (No Variant Group) —</option>
                            {variantGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.code}) — {g.category || "General"}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">
                            Variant Label <span className="text-muted-foreground font-normal">(Display label at billing/checkout)</span>
                          </label>
                          <input
                            value={vgLabelInput}
                            onChange={(e) => setVgLabelInput(e.target.value)}
                            placeholder="e.g. Sagwan Wood 6ft, Teak 5ft"
                            className={INP}
                          />
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={handleSaveVariantGroup}
                            disabled={savingVg}
                            className={BTN_PRIMARY}
                          >
                            <Save className="h-4 w-4" />{savingVg ? "Updating Group Mapping…" : "Save Variant Mapping"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Link to Finished Good Form */}
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold text-sm text-foreground">Attach to Finished Good (2-Way Mapping)</h3>
                        </div>
                        <span className="text-xs text-muted-foreground">e.g. Bahubali Deluxe King Bed</span>
                      </div>

                      <form onSubmit={handleAttachToFg} className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="sm:col-span-2">
                          <label className="block text-muted-foreground mb-1">Select Finished Good *</label>
                          <select
                            value={selectedFgId}
                            onChange={(e) => setSelectedFgId(e.target.value ? Number(e.target.value) : "")}
                            className={SEL}
                          >
                            <option value="">-- Choose Finished Good --</option>
                            {finishedGoods.map((fg) => (
                              <option key={fg.id} value={fg.id}>
                                {fg.product_name} ({fg.product_code})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-muted-foreground mb-1">Charge Mode</label>
                          <select
                            value={fgChargeMode}
                            onChange={(e) => setFgChargeMode(e.target.value as "FREE" | "CHARGEABLE")}
                            className={SEL}
                          >
                            <option value="FREE">Free / Included (₹0 extra)</option>
                            <option value="CHARGEABLE">Chargeable (Extra add-on)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-muted-foreground mb-1">
                            {fgChargeMode === "FREE" ? "Sale Price" : "Add-on Price (₹)"}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            disabled={fgChargeMode === "FREE"}
                            value={fgChargeMode === "FREE" ? "0.00" : fgSalePrice}
                            onChange={(e) => setFgSalePrice(e.target.value)}
                            className={INP + (fgChargeMode === "FREE" ? " opacity-50" : "")}
                          />
                        </div>

                        <div>
                          <label className="block text-muted-foreground mb-1">Qty per FG Unit</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={fgQuantity}
                            onChange={(e) => setFgQuantity(e.target.value)}
                            className={INP}
                          />
                        </div>

                        <div className="flex items-center gap-2 sm:col-span-2 pt-4">
                          <input
                            id="fg-def-inc"
                            type="checkbox"
                            checked={fgDefaultInc}
                            onChange={(e) => setFgDefaultInc(e.target.checked)}
                            className="h-4 w-4 rounded"
                          />
                          <label htmlFor="fg-def-inc" className="text-foreground">Pre-select on new sales / contracts</label>
                        </div>

                        <div className="sm:col-span-1 pt-3">
                          <button
                            type="submit"
                            disabled={linkingFg || !selectedFgId}
                            className={BTN_PRIMARY + " w-full justify-center"}
                          >
                            <Plus className="h-4 w-4" />{linkingFg ? "Linking…" : "Attach to FG"}
                          </button>
                        </div>

                        {linkFgErr && (
                          <div className="sm:col-span-4 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-destructive">
                            {linkFgErr}
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Linked Finished Goods Table */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">
                          Finished Goods Currently Using This Accessory
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          {activeProfileAcc.linked_finished_goods?.length ?? 0} finished goods linked
                        </span>
                      </div>

                      {(!activeProfileAcc.linked_finished_goods || activeProfileAcc.linked_finished_goods.length === 0) ? (
                        <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                          This accessory is not attached to any Finished Goods yet. Select a finished good above to link it.
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
                              {activeProfileAcc.linked_finished_goods.map((link) => (
                                <tr key={link.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                                  <td className="px-4 py-2.5 font-semibold text-foreground">
                                    <Link
                                      href={`/admin/inventory/finished-goods/${link.finished_good_id}`}
                                      className="hover:underline text-primary"
                                    >
                                      {link.product_name}
                                    </Link>
                                    {link.is_default_included && (
                                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        Default
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                                    {link.product_code} {link.sku ? `· ${link.sku}` : ""}
                                  </td>
                                  <td className="px-4 py-2.5 text-center">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${link.charge_mode === "FREE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                                      {link.charge_mode === "FREE" ? "🎁 Free" : "🏷️ Chargeable"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                                    ₹{link.sale_price}
                                  </td>
                                  <td className="px-4 py-2.5 text-center font-mono">
                                    {parseFloat(link.quantity).toFixed(2)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      type="button"
                                      onClick={() => handleUnlinkFg(link.finished_good_id, link.id)}
                                      className="rounded p-1 text-destructive hover:bg-destructive/10"
                                      title="Unlink accessory from this finished good"
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

      </div>
    </ERPPageShell>
  );
}
