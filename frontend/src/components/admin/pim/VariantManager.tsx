"use client";
import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Plus, Trash2, Check, X, Search, ChevronLeft, ChevronRight,
  Zap, TrendingUp, Package, AlertTriangle, BarChart3, Settings2,
  RefreshCw, Download, Database
} from "lucide-react";
import { pimService, type PimVariant, type PimCategoryAttribute } from "@/services/pim";
import { formatRupee } from "@/lib/utils/currency";

interface Props {
  productId: number;
  productCode: string;
  variants: PimVariant[];
  allAttributes: PimCategoryAttribute[];
  onRefresh: () => void;
}

interface NewVariantForm {
  sku: string;
  price: string;
  cost_price: string;
  quantity_on_hand: string;
  reorder_level: string;
  attrValues: Record<number, string>;
}

type SortField = "sku" | "price" | "quantity_on_hand";
type SortDir = "asc" | "desc";
type ActivePanel = null | "add" | "generate" | "bulk-price";

const PAGE_SIZE = 20;

const emptyForm = (): NewVariantForm => ({
  sku: "", price: "", cost_price: "", quantity_on_hand: "0", reorder_level: "0", attrValues: {},
});

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: typeof Package; label: string; value: string | number; sub?: string;
  tone?: "default" | "warn" | "good";
}) {
  const ring = tone === "warn" ? "border-amber-300 dark:border-amber-800"
    : tone === "good" ? "border-emerald-300 dark:border-emerald-800"
    : "border-border";
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

export default function VariantManager({ productId, productCode, variants, allAttributes, onRefresh }: Props) {
  // --- workbench attributes ---
  const [wbAttributes, setWbAttributes] = useState<any[]>([]);
  const [selectedAttrIds, setSelectedAttrIds] = useState<Set<number>>(new Set());

  // --- panels ---
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [form, setForm] = useState<NewVariantForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activePanel === "generate" && productCode) {
      pimService.getWorkbenchAttributes(productCode).then((data) => {
        setWbAttributes(data.attributes);
        const selected = new Set<number>();
        data.attributes.forEach((a: any) => {
          if (a.is_selected_for_variants) selected.add(a.id);
        });
        setSelectedAttrIds(selected);
      });
    }
  }, [activePanel, productCode]);

  const toggleAttrSelection = (id: number) => {
    const next = new Set(selectedAttrIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedAttrIds(next);
  };

  // --- table state ---
  const [search, setSearch] = useState("");
  const [filterAttr, setFilterAttr] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<SortField>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // --- inline editing ---
  const [editingStock, setEditingStock] = useState<number | null>(null);
  const [stockQty, setStockQty] = useState("");
  const [editingPrice, setEditingPrice] = useState<number | null>(null);
  const [priceVal, setPriceVal] = useState("");

  // --- generate state ---
  const [pricingRules, setPricingRules] = useState<Record<string, string>>({});
  const [clearExisting, setClearExisting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<{ created: number; skipped: number; total: number } | null>(null);
  const [previewData, setPreviewData] = useState<{
    total_combinations: number; price_range: { min: number; max: number };
    sample_skus: { sku: string; price: number; attributes: Record<string, string> }[];
  } | null>(null);

  // --- bulk price state ---
  const [bulkMode, setBulkMode] = useState<"percent" | "fixed">("percent");
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

  // ──────────────────────────── Summary stats ────────────────────────────
  const stats = useMemo(() => {
    if (variants.length === 0) return null;
    const prices = variants.map((v) => Number(v.price));
    const totalStock = variants.reduce((s, v) => s + v.quantity_on_hand, 0);
    const lowStock = variants.filter((v) => v.is_low_stock).length;
    const active = variants.filter((v) => v.is_active).length;
    return {
      total: variants.length,
      active,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      totalStock,
      lowStock,
    };
  }, [variants]);

  // ──────────────────────────── Filtering / sorting / paging ────────────────────────────
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

  // ──────────────────────────── Selection ────────────────────────────
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

  // ──────────────────────────── CRUD ────────────────────────────
  const handleCreate = async () => {
    if (!form.sku || !form.price) return;
    setSaving(true);
    try {
      await pimService.createVariant(productId, {
        sku: form.sku, price: form.price, cost_price: form.cost_price || undefined,
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

  // ──────────────────────────── Auto-generate ────────────────────────────
  const handlePreview = useCallback(async () => {
    if (!productCode) return;
    const rules: Record<string, number> = {};
    for (const [k, v] of Object.entries(pricingRules)) {
      if (v && Number(v)) rules[k] = Number(v);
    }
    try {
      const data = await pimService.previewVariants(productCode, rules, Array.from(selectedAttrIds));
      setPreviewData(data);
    } catch { /* */ }
  }, [productCode, pricingRules, selectedAttrIds]);

  const handleGenerate = async () => {
    if (!productCode) return;
    setGenerating(true);
    setGenResult(null);
    const rules: Record<string, number> = {};
    for (const [k, v] of Object.entries(pricingRules)) {
      if (v && Number(v)) rules[k] = Number(v);
    }
    try {
      const result = await pimService.generateVariants(productCode, rules, clearExisting, Array.from(selectedAttrIds));
      setGenResult(result);
      onRefresh();
    } catch { /* */ } finally { setGenerating(false); }
  };

  // ──────────────────────────── Bulk price ────────────────────────────
  const handleBulkPrice = async () => {
    if (!bulkAmount || selected.size === 0) return;
    setBulkApplying(true);
    const updates: Record<string, Record<string, unknown>> = {};
    const amt = Number(bulkAmount);
    for (const v of variants) {
      if (!selected.has(v.id)) continue;
      const currentPrice = Number(v.price);
      const newPrice = bulkMode === "percent"
        ? currentPrice * (1 + amt / 100)
        : currentPrice + amt;
      updates[v.sku] = { price: Math.max(0, Math.round(newPrice * 100) / 100) };
    }
    try {
      await pimService.bulkUpdateVariants(productCode, updates);
      setSelected(new Set());
      setBulkAmount("");
      setActivePanel(null);
      onRefresh();
    } catch { /* */ } finally { setBulkApplying(false); }
  };

  // ──────────────────────────── CSV export ────────────────────────────
  const exportCsv = () => {
    const rows = [["SKU", "Attributes", "Price", "Cost Price", "Stock", "Reorder Level", "Active"].join(",")];
    for (const v of filtered) {
      rows.push([
        v.sku,
        `"${v.variant_label.replace(/"/g, '""')}"`,
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

  // ══════════════════════════════ RENDER ══════════════════════════════

  return (
    <div className="space-y-4">

      {/* ───── Summary cards ───── */}
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

      {/* ───── Toolbar ───── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text" placeholder="Search SKU, attributes..."
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-ring"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <button type="button" onClick={() => setActivePanel(activePanel === "generate" ? null : "generate")}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${activePanel === "generate" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          <Zap className="h-4 w-4" /> Auto-Generate
        </button>
        {selected.size > 0 && (
          <button type="button" onClick={() => setActivePanel(activePanel === "bulk-price" ? null : "bulk-price")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${activePanel === "bulk-price" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            <Settings2 className="h-4 w-4" /> Bulk Price ({selected.size})
          </button>
        )}
        <button type="button" onClick={() => setActivePanel(activePanel === "add" ? null : "add")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" /> Add SKU
        </button>
        {variants.length > 0 && (
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted" title="Export CSV">
            <Download className="h-4 w-4" />
          </button>
        )}
        {selected.size > 0 && (
          <button type="button" onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Delete ({selected.size})
          </button>
        )}
      </div>

      {/* ───── Attribute filters ───── */}
      {Object.keys(attrFilters).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(attrFilters).map(([slug, values]) => (
            <select key={slug}
              className="rounded-lg border bg-background px-2 py-1.5 text-xs"
              value={filterAttr[slug] ?? ""}
              onChange={(e) => { setFilterAttr({ ...filterAttr, [slug]: e.target.value }); setPage(1); }}
            >
              <option value="">{slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: All</option>
              {[...values].sort().map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          ))}
          {Object.values(filterAttr).some(Boolean) && (
            <button type="button" onClick={() => { setFilterAttr({}); setPage(1); }}
              className="rounded-lg border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* ═══════ Auto-Generate Panel ═══════ */}
      {activePanel === "generate" && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2"><Zap className="h-4 w-4" /> Auto-Generate Variants</h4>
            <button type="button" onClick={() => setActivePanel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <p className="text-xs text-muted-foreground">
            Select the attributes you want to combine to create SKUs. You can choose any attribute mapped to this product category.
          </p>

          {wbAttributes.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 border rounded-lg bg-background">Loading attributes...</p>
          ) : (
            <>
              <div className="mb-6">
                <h5 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  1. Select Attributes to Combine
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {wbAttributes.map((attr) => {
                    const optPreview = attr.options.slice(0, 3).map((o: any) => o.display_name).join(", ") + (attr.options.length > 3 ? ` +${attr.options.length - 3} more` : "");
                    return (
                    <label key={attr.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${selectedAttrIds.has(attr.id) ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background hover:border-primary/50'}`}>
                      <input type="checkbox" className="mt-1 accent-primary h-4 w-4" checked={selectedAttrIds.has(attr.id)} onChange={() => toggleAttrSelection(attr.id)} />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground truncate" title={attr.name}>{attr.name}</span>
                          <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{attr.data_type}</span>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono truncate" title={attr.slug}>#{attr.slug}</div>
                        <div className="text-xs text-muted-foreground bg-background border rounded-md px-2 py-1 truncate">
                          {attr.option_count > 0 ? optPreview : "No options"}
                        </div>
                      </div>
                    </label>
                  )})}
                </div>
              </div>

              <div className="space-y-3 mb-6">
                <h5 className="text-sm font-medium">2. Set Pricing Rules (Optional add-ons)</h5>
                {wbAttributes.filter((a) => selectedAttrIds.has(a.id)).length === 0 && (
                  <p className="text-xs text-muted-foreground italic bg-background p-3 rounded-lg border border-dashed">Select at least one attribute above to set pricing rules.</p>
                )}
                {wbAttributes.filter((a) => selectedAttrIds.has(a.id)).map((attr) => (
                  <div key={attr.id} className="bg-background rounded-lg border p-3">
                    <div className="text-sm font-medium mb-2">{attr.name} <span className="text-xs text-muted-foreground">({attr.options.length} options)</span></div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {attr.options.map((opt: any) => {
                        const ruleKey = `${attr.slug}::${opt.value}`;
                        return (
                          <div key={opt.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
                            <span className="text-xs flex-1 truncate" title={opt.display_name}>{opt.display_name}</span>
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
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
                              <td className="px-2 py-1 text-right tabular-nums">{formatRupee(s.price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {previewData.total_combinations > previewData.sample_skus.length && (
                        <p className="text-xs text-muted-foreground mt-1">Showing {previewData.sample_skus.length} of {previewData.total_combinations}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {genResult && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3 text-sm">
                  Generated <strong>{genResult.created}</strong> new variants
                  {genResult.skipped > 0 && <>, skipped <strong>{genResult.skipped}</strong> (already exist)</>}
                  . Total: <strong>{genResult.total}</strong>.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════ Bulk Price Panel ═══════ */}
      {activePanel === "bulk-price" && selected.size > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold flex items-center gap-2"><Settings2 className="h-4 w-4" /> Bulk Price Adjustment — {selected.size} variant(s)</h4>
            <button type="button" onClick={() => setActivePanel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium">Mode</label>
              <select className="mt-1 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={bulkMode} onChange={(e) => setBulkMode(e.target.value as "percent" | "fixed")}
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed amount (₹)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">{bulkMode === "percent" ? "Percentage" : "Amount"}</label>
              <input type="number" step={bulkMode === "percent" ? "1" : "100"}
                className="mt-1 block w-32 rounded-lg border bg-background px-3 py-2 text-sm"
                value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)}
                placeholder={bulkMode === "percent" ? "+10 or -5" : "+500 or -200"}
              />
            </div>
            <button type="button" onClick={handleBulkPrice} disabled={bulkApplying || !bulkAmount}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {bulkApplying ? "Applying..." : "Apply"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {bulkMode === "percent"
              ? `Each selected variant's price will change by ${bulkAmount || "0"}%.`
              : `₹${bulkAmount || "0"} will be added to each selected variant's price.`}
          </p>
        </div>
      )}

      {/* ═══════ Add Variant Panel ═══════ */}
      {activePanel === "add" && (
        <div className="rounded-xl border p-5 space-y-4 bg-muted/20">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">New Variant (SKU)</h4>
            <button type="button" onClick={() => { setActivePanel(null); setForm(emptyForm()); }} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium">SKU *</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="PROD-001-RED" />
            </div>
            <div>
              <label className="text-xs font-medium">Selling Price *</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium">Cost Price</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium">Opening Stock</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.quantity_on_hand} onChange={(e) => setForm({ ...form, quantity_on_hand: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium">Reorder Level</label>
              <input type="number" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} />
            </div>
          </div>

          {allAttributes.length > 0 && (
            <div>
              <p className="text-xs font-medium mb-2 text-muted-foreground">Variant Attributes</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allAttributes.map((attr) => (
                  <div key={attr.id}>
                    <label className="text-xs font-medium">{attr.name}</label>
                    {attr.data_type === "CHOICE" ? (
                      <select className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                        value={form.attrValues[attr.id] ?? ""}
                        onChange={(e) => setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })}
                      >
                        <option value="">-- Select --</option>
                        {attr.options.map((opt) => <option key={opt.id} value={opt.value}>{opt.display_name}</option>)}
                      </select>
                    ) : (
                      <input type="text" className="mt-1 w-full rounded-lg border px-3 py-1.5 text-sm bg-background"
                        value={form.attrValues[attr.id] ?? ""}
                        onChange={(e) => setForm({ ...form, attrValues: { ...form.attrValues, [attr.id]: e.target.value } })}
                        placeholder={attr.name} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={saving || !form.sku || !form.price}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >{saving ? "Saving..." : "Add Variant"}</button>
            <button type="button" onClick={() => { setActivePanel(null); setForm(emptyForm()); }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
          </div>
        </div>
      )}

      {/* ═══════ Variant Table ═══════ */}
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
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" checked={allPageSelected} onChange={toggleAll} className="accent-primary" />
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("sku")}>
                      SKU{sortIcon("sku")}
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">Attributes</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("price")}>
                      Price{sortIcon("price")}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground cursor-pointer select-none" onClick={() => toggleSort("quantity_on_hand")}>
                      Stock{sortIcon("quantity_on_hand")}
                    </th>
                    <th className="px-3 py-2.5 text-center font-medium text-muted-foreground w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pageVariants.map((v) => (
                    <tr key={v.id} className={`transition-colors ${selected.has(v.id) ? "bg-primary/5" : "hover:bg-muted/30"} ${v.is_low_stock ? "bg-red-50/30 dark:bg-red-950/10" : ""}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleOne(v.id)} className="accent-primary" />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{v.sku}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs">
                        <div className="flex flex-wrap gap-1">
                          {v.attribute_values.map((a) => (
                            <span key={a.attribute_slug} className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
                              {a.value_text}
                            </span>
                          ))}
                          {v.attribute_values.length === 0 && <span className="text-muted-foreground/50">--</span>}
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
                          <button
                            className={`tabular-nums hover:underline ${v.is_low_stock ? "text-red-600 font-medium" : ""}`}
                            onClick={() => { setEditingStock(v.id); setStockQty(String(v.quantity_on_hand)); }}
                          >
                            {v.quantity_on_hand}{v.is_low_stock && <span className="ml-1 text-[10px]">(low)</span>}
                          </button>
                        )}
                      </td>

                      <td className="px-3 py-2 text-center">
                        <button type="button" onClick={() => handleDelete(v.id)} className="text-destructive/60 hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
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
                  <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
                    className="rounded-md border p-1.5 hover:bg-background disabled:opacity-30">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-2 text-xs tabular-nums">{safePage} / {totalPages}</span>
                  <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}
                    className="rounded-md border p-1.5 hover:bg-background disabled:opacity-30">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
