"use client";

import { Search, X, ChevronDown, Package } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  searchAdminInventoryItems,
  listInventoryCategories,
  type AdminInventoryItemSearchRow,
  type InventoryCategoriesResponse,
} from "@/services/inventory";

export type ProductPickerValue = {
  id: number;
  sku: string;
  product_name: string;
  product_code: string;
  category: string;
  subcategory: string;
  standard_unit_cost: string | null;
  unit_of_measure: string;
  default_stock_location_id?: number | null;
  default_stock_location_code?: string | null;
  attributes?: Record<string, string | number | boolean>;
  accessories?: Array<{ name: string; qty: number; type: string }>;
};

type Props = {
  value: ProductPickerValue | null;
  onChange: (item: ProductPickerValue | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  "data-testid"?: string;
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  FINISHED_GOOD: "Finished Good",
  ACCESSORY: "Accessory",
  RAW_MATERIAL: "Raw Material",
};

export default function ProductPickerCombobox({
  value,
  onChange,
  placeholder = "Search by SKU, name, product code, barcode…",
  disabled = false,
  required = false,
  "data-testid": testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminInventoryItemSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Filters
  const [categories, setCategories] = useState<InventoryCategoriesResponse | null>(null);
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubcategory, setFilterSubcategory] = useState("");
  const [filterType, setFilterType] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load categories once
  useEffect(() => {
    void listInventoryCategories().then(setCategories).catch(() => null);
  }, []);

  const search = useCallback(async (q: string, cat: string, subcat: string, type: string) => {
    setLoading(true);
    try {
      const res = await searchAdminInventoryItems({
        q: q || undefined,
        category: cat || undefined,
        subcategory: subcat || undefined,
        stock_item_type: type || undefined,
        include_locations: true,
      });
      setResults(res.results);
      setActiveIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search trigger
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void search(query, filterCategory, filterSubcategory, filterType), 220);
    return () => clearTimeout(t);
  }, [open, query, filterCategory, filterSubcategory, filterType, search]);

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function openPicker() {
    if (disabled) return;
    setOpen(true);
    setQuery("");
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectItem(item: AdminInventoryItemSearchRow) {
    onChange({
      id: item.id,
      sku: item.sku,
      product_name: item.product_name,
      product_code: item.product_code,
      category: item.category,
      subcategory: item.subcategory,
      standard_unit_cost: item.standard_unit_cost,
      unit_of_measure: item.unit_of_measure,
      default_stock_location_id: item.default_stock_location_id,
      default_stock_location_code: item.default_stock_location_code,
      attributes: item.attributes,
      accessories: item.accessories,
    });
    setOpen(false);
    setQuery("");
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && results[activeIndex]) {
      e.preventDefault();
      selectItem(results[activeIndex]);
    }
  }

  // Subcategories filtered to selected category
  const visibleSubcats = filterCategory && categories
    ? categories.subcategories.filter((s) => s.category === filterCategory)
    : (categories?.subcategories ?? []);

  return (
    <div ref={wrapRef} className="relative w-full" onKeyDown={handleKeyDown}>
      {/* Trigger button / selected display */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls="product-picker-listbox"
        tabIndex={disabled ? -1 : 0}
        data-testid={testId}
        onClick={disabled ? undefined : openPicker}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition-all shadow-sm ${
          disabled ? "cursor-not-allowed opacity-60 bg-muted border-border" : "border-border/60 bg-card hover:border-primary/40 hover:shadow-md focus:border-primary focus:ring-4 focus:ring-primary/10"
        } ${required && !value ? "border-destructive/60" : ""}`}
      >
        {value ? (
          <>
            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 min-w-0">
              <span className="font-semibold text-foreground">{value.product_name}</span>
              {value.sku ? <span className="ml-2 text-xs text-muted-foreground">{value.sku}</span> : null}
              {value.category ? <span className="ml-2 text-xs text-muted-foreground">{value.category}</span> : null}
            </span>
            <button aria-label="Close"
              type="button"
              onClick={clearValue}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-muted-foreground">{placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </div>

      {/* Dropdown panel */}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-[9999] mt-2 overflow-hidden rounded-xl border-2 border-primary/20 bg-white shadow-2xl dark:bg-[#121318] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.9)]" style={{ boxShadow: "0 12px 48px -12px rgba(10,14,28,0.4), 0 4px 16px -4px rgba(10,14,28,0.2)" }}>
          {/* Search input */}
          <div className="border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="SKU · product code · name · barcode…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              {loading ? <span className="text-xs text-muted-foreground">Searching…</span> : null}
            </div>
          </div>

          {/* Filter chips */}
          {categories && (categories.categories.length > 0 || categories.stock_item_types.length > 0) ? (
            <div className="flex flex-wrap gap-2 border-b border-border px-3 py-2">
              {/* Category */}
              {categories.categories.length > 0 ? (
                <select
                  value={filterCategory}
                  onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory(""); }}
                  className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                >
                  <option value="">All categories</option>
                  {categories.categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : null}

              {/* Subcategory (only if category selected) */}
              {filterCategory && visibleSubcats.length > 0 ? (
                <select
                  value={filterSubcategory}
                  onChange={(e) => setFilterSubcategory(e.target.value)}
                  className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
                >
                  <option value="">All subcategories</option>
                  {visibleSubcats.map((s) => (
                    <option key={s.subcategory} value={s.subcategory}>{s.subcategory}</option>
                  ))}
                </select>
              ) : null}

              {/* Item type */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-border bg-card px-2 py-1 text-xs"
              >
                <option value="">All types</option>
                {categories.stock_item_types.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>

              {/* Clear filters */}
              {(filterCategory || filterSubcategory || filterType) ? (
                <button
                  type="button"
                  onClick={() => { setFilterCategory(""); setFilterSubcategory(""); setFilterType(""); }}
                  className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Clear filters
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Results list */}
          <ul
            ref={listRef}
            role="listbox"
            className="max-h-72 overflow-y-auto py-1"
          >
            {results.length === 0 && !loading ? (
              <li className="px-4 py-5 text-center text-sm text-muted-foreground">
                {query || filterCategory || filterType ? "No products found. Try a different search or filters." : "Start typing to search products…"}
              </li>
            ) : null}

            {results.map((item, idx) => {
              const code = item.product_code || item.sku || `#${item.inventory_item_id}`;
              const locs = item.available_by_location ?? [];
              const totalAvail = locs.reduce((s, l) => s + Number(l.available_quantity ?? 0), 0);
              const hasLocData = locs.length > 0;
              const inStock = totalAvail > 0;
              const typeLabel = ITEM_TYPE_LABELS[item.stock_item_type] ?? item.stock_item_type ?? "Item";
              const typeColor =
                item.stock_item_type === "ACCESSORY"
                  ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                  : item.stock_item_type === "RAW_MATERIAL"
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
              return (
                <li
                  key={item.id}
                  role="option"
                  aria-selected={activeIndex === idx}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                  className={`cursor-pointer px-4 py-3 transition ${
                    activeIndex === idx ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-blue-50/60 dark:hover:bg-blue-950/30"
                  }`}
                >
                  {/* Row 1: type badge + code + name + stock pill */}
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${typeColor}`}>{typeLabel}</span>
                    <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">{code}</span>
                    <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-900 dark:text-slate-100">{item.product_name}</span>
                    {hasLocData ? (
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                        inStock
                          ? "border-green-400 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900 dark:text-green-200"
                          : "border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900 dark:text-red-200"
                      }`}>
                        {inStock ? "✓ In Stock" : "✗ Out of Stock"}
                      </span>
                    ) : null}
                  </div>

                  {/* Row 2: cost · stock qty · unit · category · barcode */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 pl-0.5 text-[12px]">
                    {item.standard_unit_cost ? (
                      <span className="font-bold text-slate-900 dark:text-white">₹{Number(item.standard_unit_cost).toLocaleString("en-IN")}<span className="font-normal text-slate-400">/unit</span></span>
                    ) : null}
                    {hasLocData ? (
                      <span className="text-slate-500 dark:text-slate-400">Stock: <strong className="text-slate-800 dark:text-slate-200">{totalAvail}</strong> {item.unit_of_measure || "PCS"}</span>
                    ) : item.unit_of_measure ? (
                      <span className="text-slate-500 dark:text-slate-400">Unit: {item.unit_of_measure}</span>
                    ) : null}
                    {item.category ? (
                      <span className="text-slate-400 dark:text-slate-500">{item.category}{item.subcategory ? ` › ${item.subcategory}` : ""}</span>
                    ) : null}
                    {item.barcode ? (
                      <span className="font-mono text-slate-500 dark:text-slate-400">#{item.barcode}</span>
                    ) : null}
                  </div>

                  {/* Row 3: per-location availability chips */}
                  {hasLocData ? (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
                      {locs.slice(0, 6).map((l) => (
                        <span key={l.stock_location_id} className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <span className="font-normal text-slate-400 dark:text-slate-500">{l.stock_location_code || l.stock_location_name}: </span>{l.available_quantity}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Row 4: Attributes (Specs) */}
                  {item.attributes && Object.keys(item.attributes).length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
                      {Object.entries(item.attributes).map(([key, val]) => (
                        <span key={key} className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:border-indigo-800/50 dark:bg-indigo-900/30 dark:text-indigo-300">
                          <span className="opacity-70">{key}: </span>{String(val)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Row 5: Accessories */}
                  {item.accessories && item.accessories.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
                      {item.accessories.map((acc, accIdx) => (
                        <span key={accIdx} className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1">
                          <span className="text-amber-500/80">⊎</span> {acc.name} <span className="opacity-70">x{acc.qty}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Footer hint */}
          <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
            {results.length > 0 ? `${results.length} result${results.length !== 1 ? "s" : ""}` : ""} · Arrow keys to navigate · Enter to select · Esc to close
          </div>
        </div>
      ) : null}
    </div>
  );
}
