"use client";

import { Search, X, ChevronDown, Package, Tag } from "lucide-react";
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
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        onClick={openPicker}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${
          disabled ? "cursor-not-allowed opacity-60 bg-muted border-border" : "border-border bg-card hover:border-ring"
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
            <button
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
      </button>

      {/* Dropdown panel */}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-card" style={{ boxShadow: "0 8px 40px -8px rgba(10,14,28,0.28), 0 2px 8px -2px rgba(10,14,28,0.14)" }}>
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

            {results.map((item, idx) => (
              <li
                key={item.id}
                role="option"
                aria-selected={activeIndex === idx}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => { e.preventDefault(); selectItem(item); }}
                className={`cursor-pointer px-3 py-2.5 transition ${
                  activeIndex === idx ? "bg-muted" : "hover:bg-muted/60"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 flex-shrink-0">
                    <Package className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{item.product_name}</span>
                      {item.sku ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-sky-800">{item.sku}</span>
                      ) : null}
                      {item.product_code ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{item.product_code}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {item.category ? (
                        <span className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {item.category}{item.subcategory ? ` › ${item.subcategory}` : ""}
                        </span>
                      ) : null}
                      {item.stock_item_type ? (
                        <span>{ITEM_TYPE_LABELS[item.stock_item_type] ?? item.stock_item_type}</span>
                      ) : null}
                      {item.unit_of_measure ? (
                        <span>Unit: {item.unit_of_measure}</span>
                      ) : null}
                      {item.standard_unit_cost ? (
                        <span className="font-semibold text-foreground">₹{Number(item.standard_unit_cost).toLocaleString("en-IN")}/unit</span>
                      ) : null}
                      {item.barcode ? (
                        <span className="font-mono">#{item.barcode}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            ))}
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
