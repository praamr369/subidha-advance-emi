"use client";
import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Check, X, Search, ChevronLeft, ChevronRight,
  Zap, TrendingUp, Package, AlertTriangle, BarChart3, Settings2,
  RefreshCw, Download, Database, Image as ImageIcon, Upload,
  ChevronDown, ChevronUp, Pencil, RefreshCcw, CheckCircle2, Layers, Lock, QrCode
} from "lucide-react";
import { pimService, type PimVariant, type PimCategoryAttribute } from "@/services/pim";
import { type AttributeValues } from "./DynamicAttributeForm";
import { formatRupee } from "@/lib/utils/currency";
import QRLabelPrintModal, { type QRLabelItem } from "@/components/inventory/QRLabelPrintModal";

interface Props {
  productId: number;
  productCode: string;
  productName?: string;
  basePrice?: string;
  variants: PimVariant[];
  allAttributes: PimCategoryAttribute[];
  onRefresh: () => void;
  /** Attribute IDs locked at the parent product level */
  lockedAttributes?: Set<number>;
  /** Parent product's saved attribute values — locked ones are shown read-only in variant editor */
  parentAttrValues?: AttributeValues;
}

interface WorkbenchAttributeOption { id: number; value: string; display_name: string; extra_cost?: string | number; }
interface WorkbenchAttribute {
  id: number; name: string; slug: string; data_type: string;
  is_variant_defining: boolean; is_selected_for_variants?: boolean;
  option_count: number; options: WorkbenchAttributeOption[];
}
interface NewVariantForm {
  sku: string; barcode: string; price: string; cost_price: string;
  quantity_on_hand: string; reorder_level: string; attrValues: Record<number, string>;
}
interface VariantEditState {
  price: string; cost_price: string; barcode: string; reorder_level: string;
  attrValues: Record<number, string>;
}

type SortField = "sku" | "price" | "quantity_on_hand";
type SortDir = "asc" | "desc";
type ActivePanel = null | "add" | "generate" | "bulk-price";
const PAGE_SIZE = 20;
const emptyForm = (): NewVariantForm => ({
  sku: "", barcode: "", price: "", cost_price: "", quantity_on_hand: "0", reorder_level: "0", attrValues: {},
});

/** Auto-generate the next SKU: productCode + "-A", "-B", … "-Z", "-AA", "-AB", … */
function generateNextSku(productCode: string, existingVariants: PimVariant[]): string {
  const prefix = `${productCode}-`;
  const usedSuffixes = new Set(
    existingVariants
      .map((v) => (v.sku.startsWith(prefix) ? v.sku.slice(prefix.length) : null))
      .filter(Boolean) as string[]
  );
  const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let i = 0; i < 702; i++) {
    const suffix =
      i < 26
        ? ALPHA[i]
        : ALPHA[Math.floor(i / 26) - 1] + ALPHA[i % 26];
    if (!usedSuffixes.has(suffix)) return `${prefix}${suffix}`;
  }
  return `${prefix}${Date.now()}`;
}

/** Build attrValues pre-fill from the most recently saved variant (copy-last pattern). */
function attrValuesFromVariant(variant: PimVariant): Record<number, string> {
  const out: Record<number, string> = {};
  for (const av of variant.attribute_values) {
    out[av.attribute] =
      av.value_text ?? (av.value_number != null ? String(av.value_number) : "");
  }
  return out;
}

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Package; label: string; value: string | number; sub?: string;
  tone?: "default" | "warn" | "good";
}) {
  const ring = tone === "warn" ? "border-amber-300 dark:border-amber-800"
    : tone === "good" ? "border-emerald-300 dark:border-emerald-800" : "border-border";
  return (
    <div className={`rounded-xl border ${ring} bg-background px-4 py-3 flex items-start gap-3`}>
      <div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/** Resolve display label for a locked attribute value */
function lockedDisplayValue(attr: PimCategoryAttribute, rawVal: AttributeValues[number] | undefined): string {
  if (!rawVal) return "—";
  if (attr.data_type === "CHOICE") {
    return attr.options.find((o) => o.value === rawVal.value_text)?.display_name ?? rawVal.value_text ?? "—";
  }
  if (attr.data_type === "BOOLEAN") {
    return rawVal.value_boolean === true ? "Yes" : rawVal.value_boolean === false ? "No" : "—";
  }
  return String(rawVal.value_number || rawVal.value_text || rawVal.value_date || "—");
}

/** Read-only pill shown for a parent-locked attribute */
function LockedAttrDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
        {label}
        <span className="rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ml-1">
          Locked by parent
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/40 px-3 py-1.5">
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium">{value}</span>
      </div>
    </div>
  );
}

/** Inline expandable editor panel for a single variant row */
function VariantEditPanel({
  variant,
  allAttributes,
  lockedAttributes,
  parentAttrValues,
  onSave,
  onCancel,
}: {
  variant: PimVariant;
  allAttributes: PimCategoryAttribute[];
  lockedAttributes?: Set<number>;
  parentAttrValues?: AttributeValues;
  onSave: (data: VariantEditState) => Promise<void>;
  onCancel: () => void;
}) {
  const [state, setState] = useState<VariantEditState>(() => {
    const attrValues: Record<number, string> = {};
    for (const av of variant.attribute_values) {
      attrValues[av.attribute] = av.value_text ?? "";
    }
    return {
      price: variant.price,
      cost_price: variant.cost_price ?? "",
      barcode: variant.barcode ?? "",
      reorder_level: String(variant.reorder_level),
      attrValues,
    };
  });
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState(false);

  const set = (key: keyof Omit<VariantEditState, "attrValues">, val: string) =>
    setState((s) => ({ ...s, [key]: val }));
  const setAttr = (id: number, val: string) =>
    setState((s) => ({ ...s, attrValues: { ...s.attrValues, [id]: val } }));

  // Split attributes into locked (parent-controlled) and editable
  const locked = allAttributes.filter((a) => lockedAttributes?.has(a.id));
  const variantDefining = allAttributes.filter((a) => a.is_variant_defining && !lockedAttributes?.has(a.id));
  const nonDefining = allAttributes.filter((a) => !a.is_variant_defining && !lockedAttributes?.has(a.id));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(state);
      setSynced(true);
      setTimeout(() => setSynced(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  function AttrInput({ attr }: { attr: PimCategoryAttribute }) {
    const val = state.attrValues[attr.id] ?? "";
    if (attr.data_type === "CHOICE" && attr.options.length > 0) {
      return (
        <select
          className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
          value={val}
          onChange={(e) => setAttr(attr.id, e.target.value)}
        >
          <option value="">— Select —</option>
          {attr.options.map((o) => {
            const cost = Number(o.extra_cost ?? 0);
            const label = cost > 0 ? `${o.display_name}  (+₹${cost.toLocaleString("en-IN")})` : o.display_name;
            return <option key={o.id} value={o.value}>{label}</option>;
          })}
        </select>
      );
    }
    if (attr.data_type === "BOOLEAN") {
      return (
        <div className="flex gap-3 mt-1">
          {["Yes", "No"].map((l) => (
            <label key={l} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name={`bool-${variant.id}-${attr.id}`}
                checked={val === l} onChange={() => setAttr(attr.id, l)} className="accent-primary" />
              {l}
            </label>
          ))}
        </div>
      );
    }
    return (
      <input
        type={attr.data_type === "NUMBER" || attr.data_type === "DECIMAL" ? "number" : "text"}
        className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
        value={val}
        placeholder={`Enter ${attr.name}`}
        onChange={(e) => setAttr(attr.id, e.target.value)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/3 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Edit Variant — <span className="font-mono">{variant.sku}</span></span>
        </div>
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Locked parent attributes — read-only */}
      {locked.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Inherited from Base Product (locked)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {locked.map((attr) => (
              <LockedAttrDisplay
                key={attr.id}
                label={attr.name}
                value={lockedDisplayValue(attr, parentAttrValues?.[attr.id])}
              />
            ))}
          </div>
        </div>
      )}

      {/* Variant-defining attributes (identity) — editable */}
      {variantDefining.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-3">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Variant Identity Attributes</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {variantDefining.map((attr) => (
              <div key={attr.id}>
                <label className="text-xs font-medium text-foreground">{attr.name}</label>
                <AttrInput attr={attr} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Non-defining attributes — editable */}
      {nonDefining.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Specification Attributes</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {nonDefining.map((attr) => (
              <div key={attr.id}>
                <label className="text-xs font-medium text-foreground">{attr.name}</label>
                <AttrInput attr={attr} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing + inventory */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Pricing & Inventory</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="text-xs font-medium">Selling Price *</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
              <input type="number" step="0.01" className="w-full rounded-lg border bg-background pl-6 pr-3 py-1.5 text-sm"
                value={state.price} onChange={(e) => set("price", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Cost Price</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
              <input type="number" step="0.01" className="w-full rounded-lg border bg-background pl-6 pr-3 py-1.5 text-sm"
                value={state.cost_price} onChange={(e) => set("cost_price", e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">Barcode</label>
            <input type="text" className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm font-mono"
              value={state.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="EAN/UPC" />
          </div>
          <div>
            <label className="text-xs font-medium">Reorder Level</label>
            <input type="number" className="mt-1 w-full rounded-lg border bg-background px-3 py-1.5 text-sm"
              value={state.reorder_level} onChange={(e) => set("reorder_level", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving || !state.price}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          {saving ? <><RefreshCcw className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Check className="h-3.5 w-3.5" /> Save & Sync to Catalog</>}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
        {synced && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Synced to catalog
          </span>
        )}
      </div>
    </div>
  );
}

export default function VariantManager({ productId, productCode, productName, basePrice, variants, allAttributes, onRefresh, lockedAttributes, parentAttrValues }: Props) {
  const [wbAttributes, setWbAttributes] = useState<WorkbenchAttribute[]>([]);
  const [selectedAttrIds, setSelectedAttrIds] = useState<Set<number>>(new Set());
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [form, setForm] = useState<NewVariantForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Expanded/editing variant
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (activePanel === "generate" && productCode) {
      pimService.getWorkbenchAttributes(productCode).then((data) => {
        setWbAttributes(data.attributes);
        const selected = new Set<number>();
        data.attributes.forEach((a: WorkbenchAttribute) => { if (a.is_selected_for_variants) selected.add(a.id); });
        setSelectedAttrIds(selected);
      });
    }
  }, [activePanel, productCode]);

  const toggleAttrSelection = (id: number) => {
    const next = new Set(selectedAttrIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedAttrIds(next);
  };

  // Table state
  const [search, setSearch] = useState("");
  const [filterAttr, setFilterAttr] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<SortField>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Inline price/stock edit (quick)
  const [editingStock, setEditingStock] = useState<number | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [priceVal, setPriceVal] = useState("");

  // Generate state
  const [pricingRules, setPricingRules] = useState<Record<string, string>>({});
  const [clearExisting, setClearExisting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
  const [previewData, setPreviewData] = useState<{
    total_combinations: number; price_range: { min: number; max: number };
    sample_skus: { sku: string; price: number; attributes: Record<string, string> }[];
  } | null>(null);

  // Bulk price state
  const [bulkMode, setBulkMode] = useState<"percent" | "fixed">("percent");
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

  // Image upload
  const [uploadingImage, setUploadingImage] = useState<number | null>(null);

  // QR label printing
  const [printItem, setPrintItem] = useState<QRLabelItem | null>(null);

  const handleImageUpload = async (id: number, file: File) => {
    setUploadingImage(id);
    try { await pimService.updateVariantImage(id, file); onRefresh(); }
    catch { /* */ } finally { setUploadingImage(null); }
  };

  const stats = useMemo(() => {
    if (variants.length === 0) return null;
    const prices = variants.map((v) => Number(v.price));
    const totalStock = variants.reduce((s, v) => s + v.quantity_on_hand, 0);
    const lowStock = variants.filter((v) => v.is_low_stock).length;
    const active = variants.filter((v) => v.is_active).length;
    return { total: variants.length, active, minPrice: Math.min(...prices), maxPrice: Math.max(...prices), totalStock, lowStock };
  }, [variants]);

  const attrFilters = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const v of variants) {
      for (const av of v.attribute_values) {
        if (!map[av.attribute_slug]) map[av.attribute_slug] = new Set();
        map[av.attribute_slug].add(av.value_text);
      }
    }
    return map;
  }, [variants]);

  const filtered = useMemo(() => {
    let list = variants;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((v) =>
        v.sku.toLowerCase().includes(q) ||
        v.variant_label.toLowerCase().includes(q) ||
        v.attribute_values.some((a) => a.value_text.toLowerCase().includes(q))
      );
    }
    for (const [slug, value] of Object.entries(filterAttr)) {
      if (!value) continue;
      list = list.filter((v) => v.attribute_values.some((a) => a.attribute_slug === slug && a.value_text === value));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "sku") cmp = a.sku.localeCompare(b.sku);
      else if (sortField === "price") cmp = Number(a.price) - Number(b.price);
      else cmp = a.quantity_on_hand - b.quantity_on_hand;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [variants, search, filterAttr, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageVariants = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };
  const sortIcon = (field: SortField) => sortField === field ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const allPageSelected = pageVariants.length > 0 && pageVariants.every((v) => selected.has(v.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allPageSelected) pageVariants.forEach((v) => next.delete(v.id));
    else pageVariants.forEach((v) => next.add(v.id));
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleCreate = async () => {
    if (!form.sku || !form.price) return;
    setSaving(true);
    try {
      await pimService.createVariant(productId, {
        sku: form.sku, barcode: form.barcode || undefined, price: form.price,
        cost_price: form.cost_price || undefined,
        quantity_on_hand: Number(form.quantity_on_hand), reorder_level: Number(form.reorder_level),
        attribute_values: Object.entries(form.attrValues)
          .filter(([, v]) => v)
          .map(([attrId, v]) => ({ attribute: Number(attrId), value_text: v })),
      });
      setForm(emptyForm());
      setActivePanel(null);
      onRefresh();
    } catch { /* */ } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this variant?")) return;
    await pimService.deleteVariant(id);
    if (expandedId === id) setExpandedId(null);
    onRefresh();
  };

  const handleToggleActive = async (id: number, current: boolean) => {
    await pimService.patchVariant(id, { is_active: !current });
    onRefresh();
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected variant(s)?`)) return;
    for (const id of selected) { await pimService.deleteVariant(id); }
    setSelected(new Set());
    onRefresh();
  };

  const handleStockSave = async (id: number) => {
    await pimService.updateStock(id, Number(stockQty));
    setEditingStock(null);
    onRefresh();
  };
  const handlePriceSave = async (id: number) => {
    await pimService.updateVariantPricing(id, priceVal);
    setEditingPrice(null);
    onRefresh();
  };

  const handleSaveVariantEdit = useCallback(async (variantId: number, state: VariantEditState) => {
    await pimService.updateVariantAttributes(variantId, {
      price: state.price,
      cost_price: state.cost_price || undefined,
      barcode: state.barcode || undefined,
      reorder_level: state.reorder_level ? Number(state.reorder_level) : undefined,
      attribute_values: Object.entries(state.attrValues)
        .filter(([, v]) => v !== "")
        .map(([attrId, v]) => ({ attribute: Number(attrId), value_text: v })),
    });
    onRefresh();
  }, [onRefresh]);

  const handlePreview = useCallback(async () => {
    if (!productCode) return;
    const rules: Record<string, number> = {};
    for (const [k, v] of Object.entries(pricingRules)) { if (v && Number(v)) rules[k] = Number(v); }
    try {
      const data = await pimService.previewVariants(productCode, rules, Array.from(selectedAttrIds));
      setPreviewData(data);
    } catch { /* */ }
  }, [productCode, pricingRules, selectedAttrIds]);

  const handleGenerate = async () => {
    if (!productCode) return;
    setGenerating(true); setGenResult(null);
    const rules: Record<string, number> = {};
    for (const [k, v] of Object.entries(pricingRules)) { if (v && Number(v)) rules[k] = Number(v); }
    try {
      const result = await pimService.generateVariants(productCode, rules, clearExisting, Array.from(selectedAttrIds));
      setGenResult(result); onRefresh();
    } catch { /* */ } finally { setGenerating(false); }
  };

  const handleBulkPrice = async () => {
    if (!bulkAmount || selected.size === 0) return;
    setBulkApplying(true);
    const updates: Record<string, Record<string, unknown>> = {};
    const amt = Number(bulkAmount);
    for (const v of variants) {
      if (!selected.has(v.id)) continue;
      const newPrice = bulkMode === "percent"
        ? Number(v.price) * (1 + amt / 100)
        : Number(v.price) + amt;
      updates[v.sku] = { price: Math.max(0, Math.round(newPrice * 100) / 100) };
    }
    try {
      await pimService.bulkUpdateVariants(productCode, updates);
      setSelected(new Set()); setBulkAmount(""); setActivePanel(null); onRefresh();
    } catch { /* */ } finally { setBulkApplying(false); }
  };

  function variantToLabel(v: PimVariant): QRLabelItem {
    const attrSummary = v.attribute_values.map((a) => a.value_text).filter(Boolean).join(" / ");
    return {
      productName: productName ? `${productName}${attrSummary ? ` — ${attrSummary}` : ""}` : v.variant_label || v.sku,
      productCode: productCode,
      sku: v.sku,
      qrValue: v.sku,
    };
  }

  function handleBulkPrintQR() {
    const selectedVariants = variants.filter((v) => selected.has(v.id));
    if (selectedVariants.length === 0) return;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const labelsHtml = selectedVariants.map((v) => {
      const attrSummary = v.attribute_values.map((a) => a.value_text).filter(Boolean).join(" / ");
      const displayName = productName ? `${productName}${attrSummary ? ` — ${attrSummary}` : ""}` : v.variant_label || v.sku;
      return `
        <div class="label">
          <div class="qr-placeholder" data-sku="${v.sku}"></div>
          <div class="name">${escHtml(displayName)}</div>
          <div class="code">${escHtml(productCode)} · ${escHtml(v.sku)}</div>
          ${attrSummary ? `<div class="attrs">${escHtml(attrSummary)}</div>` : ""}
        </div>`;
    }).join("");
    // Use a QR CDN for print window (self-contained SVG QR via qrcode.js UMD)
    win.document.write(`
      <!DOCTYPE html><html>
      <head>
        <title>QR Labels — ${escHtml(productCode)}</title>
        <script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
        <style>
          @page { size: A4; margin: 10mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Courier New', monospace; background: #fff; }
          .grid { display: flex; flex-wrap: wrap; gap: 6mm; }
          .label { width: 96mm; height: 72mm; border: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px; page-break-inside: avoid; }
          canvas { display: block; }
          .name { font-size: 11px; font-weight: bold; text-align: center; max-width: 88mm; word-break: break-word; }
          .code { font-size: 10px; letter-spacing: 0.04em; }
          .attrs { font-size: 9px; color: #555; }
        </style>
      </head>
      <body>
        <div class="grid">${labelsHtml}</div>
        <script>
          document.querySelectorAll('.qr-placeholder').forEach(function(el) {
            var canvas = document.createElement('canvas');
            el.replaceWith(canvas);
            QRCode.toCanvas(canvas, el.dataset.sku || el.getAttribute('data-sku') || 'SKU', { width: 120, margin: 1 });
          });
          window.onload = function() { window.print(); };
        <\/script>
      </body></html>
    `);
    win.document.close();
  }

  function escHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const exportCsv = () => {
    const attrNames = allAttributes.filter((a) => a.is_variant_defining).map((a) => a.name);
    const header = ["SKU", "Barcode", ...attrNames, "Price", "Cost Price", "Stock", "Reorder Level", "Active"].join(",");
    const rows = [header];
    for (const v of filtered) {
      const attrCols = allAttributes
        .filter((a) => a.is_variant_defining)
        .map((a) => {
          const av = v.attribute_values.find((x) => x.attribute === a.id);
          return `"${(av?.value_text ?? "").replace(/"/g, '""')}"`;
        });
      rows.push([
        v.sku, v.barcode ?? "", ...attrCols,
        v.price, v.cost_price ?? "", String(v.quantity_on_hand), String(v.reorder_level),
        v.is_active ? "Yes" : "No",
      ].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `variants-${productCode}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Column count for the full-width expanded row
  const colSpan = 8;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={Package} label="Total SKUs" value={stats.total} sub={`${stats.active} active`} />
          <StatCard icon={TrendingUp} label="Price Range" value={`${formatRupee(stats.minPrice)} – ${formatRupee(stats.maxPrice)}`} />
          <StatCard icon={BarChart3} label="Total Inventory" value={stats.totalStock} />
          <StatCard icon={AlertTriangle} label="Low Stock" value={stats.lowStock}
            tone={stats.lowStock > 0 ? "warn" : "good"}
            sub={stats.lowStock > 0 ? `${Math.round(stats.lowStock / stats.total * 100)}% need restock` : "All stocked"}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Search SKU, attributes..."
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-ring"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <button type="button" onClick={() => setActivePanel(activePanel === "generate" ? null : "generate")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${activePanel === "generate" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        ><Zap className="h-4 w-4" /> Auto-Generate</button>
        {selected.size > 0 && (
          <button type="button" onClick={() => setActivePanel(activePanel === "bulk-price" ? null : "bulk-price")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${activePanel === "bulk-price" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          ><Settings2 className="h-4 w-4" /> Bulk Price ({selected.size})</button>
        )}
        <button type="button" onClick={() => {
          if (activePanel === "add") { setActivePanel(null); setForm(emptyForm()); return; }
          const autoSku = productCode ? generateNextSku(productCode, variants) : "";
          // Pre-fill attributes from the last saved variant (operator only changes what differs)
          const lastVariant = variants.length > 0 ? variants[variants.length - 1] : null;
          const prefillAttrs = lastVariant ? attrValuesFromVariant(lastVariant) : {};
          setForm({ ...emptyForm(), sku: autoSku, price: basePrice ?? "", attrValues: prefillAttrs });
          setActivePanel("add");
        }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        ><Plus className="h-4 w-4" /> Add SKU</button>
        {variants.length > 0 && (
          <button type="button" onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted" title="Export CSV">
            <Download className="h-4 w-4" />
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={handleBulkPrintQR}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition">
            <QrCode className="h-4 w-4" /> Print QR Labels ({selected.size})
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={handleBulkDelete}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Delete ({selected.size})
          </button>
        )}
      </div>

      {/* Attribute filters */}
      {Object.keys(attrFilters).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(attrFilters).map(([slug, values]) => (
            <select key={slug} className="rounded-lg border bg-background px-2 py-1.5 text-xs"
              value={filterAttr[slug] ?? ""}
              onChange={(e) => { setFilterAttr({ ...filterAttr, [slug]: e.target.value }); setPage(1); }}>
              <option value="">{slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: All</option>
              {[...values].sort().map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          {Object.values(filterAttr).some(Boolean) && (
            <button type="button" onClick={() => { setFilterAttr({}); setPage(1); }}
              className="rounded-lg border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">Clear filters</button>
          )}
        </div>
      )}

      {/* Auto-Generate Panel */}
      {activePanel === "generate" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4" /> Auto-Generate Variants</h4>
            <button type="button" onClick={() => setActivePanel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground">Select attributes to combine into SKUs. Each combination becomes one variant row with attributes pre-mapped.</p>
          {wbAttributes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-background">Loading attributes...</p>
          ) : (
            <>
              <div className="mb-4">
                <h5 className="text-sm font-medium mb-3 flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground" />1. Select Attributes to Combine</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {wbAttributes.map((attr) => {
                    const optPreview = attr.options.slice(0, 3).map((o) => o.display_name).join(", ") + (attr.options.length > 3 ? ` +${attr.options.length - 3} more` : "");
                    return (
                      <label key={attr.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${selectedAttrIds.has(attr.id) ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/50'}`}>
                        <input type="checkbox" className="mt-1 accent-primary h-4 w-4" checked={selectedAttrIds.has(attr.id)} onChange={() => toggleAttrSelection(attr.id)} />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold truncate">{attr.name}</span>
                            <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{attr.data_type}</span>
                          </div>
                          <div className="text-xs text-muted-foreground bg-background border rounded-md px-2 py-1 truncate">
                            {attr.option_count > 0 ? optPreview : "No options"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <h5 className="text-sm font-medium flex items-center gap-2">
                  2. Set Pricing Rules (Optional add-ons)
                  {basePrice && <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md">Base: ₹{Number(basePrice).toLocaleString("en-IN")}</span>}
                </h5>
                {wbAttributes.filter((a) => selectedAttrIds.has(a.id)).map((attr) => (
                  <div key={attr.id} className="bg-background rounded-lg border p-3">
                    <div className="text-sm font-medium mb-2">{attr.name} <span className="text-xs text-muted-foreground">({attr.options.length} options)</span></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {attr.options.map((opt) => {
                        const ruleKey = `${attr.slug}::${opt.value}`;
                        return (
                          <div key={opt.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
                            <span className="text-xs flex-1 truncate">{opt.display_name}</span>
                            <div className="flex items-center">
                              <span className="text-xs text-muted-foreground mr-1">+₹</span>
                              <input type="number" step="100" placeholder="0"
                                className="w-16 rounded border px-1.5 py-0.5 text-xs text-right bg-background"
                                value={pricingRules[ruleKey] ?? ""}
                                onChange={(e) => setPricingRules({ ...pricingRules, [ruleKey]: e.target.value })}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handlePreview} className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                  <RefreshCw className="h-3.5 w-3.5" /> Preview
                </button>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={clearExisting} onChange={(e) => setClearExisting(e.target.checked)} className="accent-primary" />
                  Clear existing variants first
                </label>
                <button type="button" onClick={handleGenerate} disabled={generating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  <Zap className="h-3.5 w-3.5" /> {generating ? "Generating..." : "Generate All"}
                </button>
              </div>
              {previewData && (
                <div className="rounded-lg border bg-background p-4 space-y-3">
                  <div className="flex gap-4 text-sm">
                    <span><strong>{previewData.total_combinations}</strong> total SKUs</span>
                    <span>Price: <strong>{formatRupee(previewData.price_range.min)}</strong> – <strong>{formatRupee(previewData.price_range.max)}</strong></span>
                  </div>
                  {previewData.sample_skus.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b">
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">Sample SKU</th>
                          <th className="px-2 py-1 text-left font-medium text-muted-foreground">Attributes</th>
                          <th className="px-2 py-1 text-right font-medium text-muted-foreground">Price</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {previewData.sample_skus.map((s) => (
                            <tr key={s.sku}>
                              <td className="px-2 py-1 font-mono">{s.sku}</td>
                              <td className="px-2 py-1 text-muted-foreground">{Object.values(s.attributes).join(" / ")}</td>
                              <td className="px-2 py-1 text-right">{formatRupee(s.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
              {genResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3 text-sm">
                  Generated <strong>{genResult.created}</strong> new variants
                  {genResult.skipped > 0 && <>, skipped <strong>{genResult.skipped}</strong> (already exist)</>}. Total: <strong>{genResult.total}</strong>.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Bulk Price Panel */}
      {activePanel === "bulk-price" && selected.size > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" /> Bulk Price — {selected.size} variant(s)</h4>
            <button type="button" onClick={() => setActivePanel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium">Mode</label>
              <select className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={bulkMode} onChange={(e) => setBulkMode(e.target.value as "percent" | "fixed")}>
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">{bulkMode === "percent" ? "Percentage" : "Amount"}</label>
              <input type="number" step={bulkMode === "percent" ? "1" : "100"}
                className="mt-1 block w-32 rounded-lg border bg-background px-3 py-2 text-sm"
                value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)}
                placeholder={bulkMode === "percent" ? "+10 or -5" : "+500"} />
            </div>
            <button type="button" onClick={handleBulkPrice} disabled={bulkApplying || !bulkAmount}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {bulkApplying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      )}

      {/* Add Variant Panel */}
      {activePanel === "add" && (
        <div className="rounded-xl border p-5 space-y-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">New Variant (SKU)</h4>
            <button type="button" onClick={() => { setActivePanel(null); setForm(emptyForm()); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium">SKU *
                <span className="ml-1.5 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">auto-generated — editable</span>
              </label>
              <input
                className="mt-1 w-full rounded-lg border-2 border-primary/40 focus:border-primary px-3 py-1.5 text-sm bg-background font-mono font-semibold"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="PROD-001-A"
              />
            </div>
            <div><label className="text-xs font-medium">Barcode</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background font-mono"
                value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="EAN/UPC (optional)" /></div>
            <div><label className="text-xs font-medium">Selling Price *</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></div>
            <div><label className="text-xs font-medium">Cost Price</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="0.00" /></div>
            <div><label className="text-xs font-medium">Opening Stock</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} /></div>
            <div><label className="text-xs font-medium">Reorder Level</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} /></div>
          </div>
          {allAttributes.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">
                Variant Attributes
                <span className="ml-2 text-[10px] font-normal text-muted-foreground/70">
                  (pre-filled from last SKU — change only what differs)
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allAttributes.map((attr) => {
                  const isLocked = lockedAttributes?.has(attr.id);
                  const lockedVal = isLocked
                    ? lockedDisplayValue(attr, parentAttrValues?.[attr.id])
                    : null;
                  if (isLocked) {
                    return (
                      <LockedAttrDisplay key={attr.id} label={attr.name} value={lockedVal ?? "—"} />
                    );
                  }
                  return (
                    <div key={attr.id}>
                      <label className="text-xs font-medium">
                        {attr.name}
                        {attr.is_variant_defining && <Layers className="inline h-3 w-3 ml-1 text-primary" />}
                      </label>
                      {attr.data_type === "CHOICE" ? (
                        <select className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                          value={form.attrValues[attr.id] ?? ""}
                          onChange={(e) => setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })}>
                          <option value="">-- Select --</option>
                          {attr.options.map((opt) => {
                            const cost = Number(opt.extra_cost ?? 0);
                            const label = cost > 0 ? `${opt.display_name}  (+₹${cost.toLocaleString("en-IN")})` : opt.display_name;
                            return <option key={opt.id} value={opt.value}>{label}</option>;
                          })}
                        </select>
                      ) : (
                        <input type="text" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                          value={form.attrValues[attr.id] ?? ""}
                          onChange={(e) => setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })}
                          placeholder={attr.name} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={saving || !form.sku || !form.price}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {saving ? "Saving..." : "Add Variant"}
            </button>
            <button type="button" onClick={() => { setActivePanel(null); setForm(emptyForm()); }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {/* Variant Table */}
      {variants.length === 0 && activePanel !== "generate" ? (
        <div className="text-center py-10 border rounded-xl">
          <Package className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No variants yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add individual SKUs or auto-generate from variant-defining attributes.</p>
        </div>
      ) : variants.length > 0 && (
        <>
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="px-3 py-2.5 w-8"><input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="accent-primary" /></th>
                    <th className="px-3 py-2.5 w-12 text-center text-muted-foreground">Img</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("sku")}>SKU{sortIcon("sku")}</th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Attributes</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("price")}>Price{sortIcon("price")}</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("quantity_on_hand")}>Stock{sortIcon("quantity_on_hand")}</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground w-20">Status</th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageVariants.map((v) => (
                    <Fragment key={v.id}>
                      {/* Main row */}
                      <tr
                        className={`transition-colors ${selected.has(v.id) ? "bg-primary/5" : "hover:bg-muted/30"} ${v.is_low_stock ? "bg-red-50/30 dark:bg-red-950/10" : ""} ${expandedId === v.id ? "bg-primary/5 border-b-0" : ""}`}
                      >
                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} className="accent-primary" /></td>
                        <td className="px-3 py-2">
                          <div className="relative group w-8 h-8 rounded border bg-muted flex items-center justify-center overflow-hidden">
                            {v.image ? <img src={v.image} alt="Variant" className="w-full h-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground/50" />}
                            <label className={`absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity ${uploadingImage === v.id ? "opacity-100 bg-black/20" : ""}`}>
                              {uploadingImage === v.id ? <RefreshCw className="h-3 w-3 text-white animate-spin" /> : <Upload className="h-3 w-3 text-white" />}
                              <input type="file" accept="image/*" className="hidden" disabled={uploadingImage === v.id}
                                onChange={(e) => { const file = e.target.files?.[0]; if (file) handleImageUpload(v.id, file); e.target.value = ""; }} />
                            </label>
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="font-mono text-xs">{v.sku}</div>
                          {v.barcode && <div className="font-mono text-[10px] text-muted-foreground mt-0.5">{v.barcode}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                          <div className="flex flex-wrap gap-1">
                            {v.attribute_values.length > 0
                              ? v.attribute_values.map((a) => (
                                  <span key={a.attribute} className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[11px]">{a.value_text}</span>
                                ))
                              : <span className="text-muted-foreground/40 italic text-[11px]">No attributes mapped</span>
                            }
                          </div>
                        </td>
                        {/* Price inline edit */}
                        <td className="px-3 py-2 text-right">
                          {editingPrice === v.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input type="number" className="w-24 rounded border px-2 py-1 text-xs" value={priceVal} onChange={(e) => setPriceVal(e.target.value)} autoFocus />
                              <button type="button" onClick={() => handlePriceSave(v.id)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => setEditingPrice(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <button className="tabular-nums hover:underline" onClick={() => { setEditingPrice(v.id); setPriceVal(v.price); }}>
                              {formatRupee(Number(v.price))}
                            </button>
                          )}
                        </td>
                        {/* Stock inline edit */}
                        <td className="px-3 py-2 text-right">
                          {editingStock === v.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input type="number" className="w-20 rounded border px-2 py-1 text-xs" value={stockQty} onChange={(e) => setStockQty(e.target.value)} autoFocus />
                              <button type="button" onClick={() => handleStockSave(v.id)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                              <button type="button" onClick={() => setEditingStock(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <button className={`tabular-nums hover:underline ${v.is_low_stock ? "text-red-600 font-medium" : ""}`}
                              onClick={() => { setEditingStock(v.id); setStockQty(String(v.quantity_on_hand)); }}>
                              {v.quantity_on_hand}{v.is_low_stock && <span className="ml-1 text-[10px]">(low)</span>}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button type="button" title={v.is_active ? "Deactivate" : "Activate"}
                            onClick={() => void handleToggleActive(v.id, v.is_active)}
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${v.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 hover:bg-emerald-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                            {v.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button type="button"
                              title={expandedId === v.id ? "Close editor" : "Edit attributes & pricing"}
                              onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                              className={`rounded-md border px-2 py-1 text-xs font-medium transition ${expandedId === v.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                              {expandedId === v.id ? <ChevronUp className="h-3.5 w-3.5" /> : <><Pencil className="inline h-3 w-3 mr-0.5" /><ChevronDown className="inline h-3 w-3" /></>}
                            </button>
                            <button type="button" title="Print QR label"
                              onClick={() => setPrintItem(variantToLabel(v))}
                              className="rounded-md border p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition">
                              <QrCode className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDelete(v.id)} className="text-destructive/60 hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded editor row */}
                      {expandedId === v.id && (
                        <tr className="bg-primary/3">
                          <td colSpan={colSpan} className="px-4 pb-4 pt-2">
                            <VariantEditPanel
                              variant={v}
                              allAttributes={allAttributes}
                              lockedAttributes={lockedAttributes}
                              parentAttrValues={parentAttrValues}
                              onSave={(state) => handleSaveVariantEdit(v.id, state)}
                              onCancel={() => setExpandedId(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t bg-muted/30 px-4 py-2">
                <div className="text-xs text-muted-foreground">
                  {filtered.length} variant{filtered.length !== 1 ? "s" : ""}{filtered.length !== variants.length ? ` (filtered from ${variants.length})` : ""}
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="rounded-md border p-1.5 hover:bg-background disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <span className="px-2 text-xs tabular-nums">{safePage} / {totalPages}</span>
                  <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="rounded-md border p-1.5 hover:bg-background disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {printItem && (
        <QRLabelPrintModal item={printItem} onClose={() => setPrintItem(null)} />
      )}
    </div>
  );
}
