"use client";

import React, { useMemo } from "react";
import { Filter, MapPin, Search, SlidersHorizontal, Tag, X } from "lucide-react";

import { formatDocumentMoney } from "@/lib/documents/formatters";
import type {
  StockOnHandFacets,
  StockOnHandFilteredSummary,
} from "@/services/inventory";

export interface InventoryCategoryAttributeFilterBarProps {
  facets: StockOnHandFacets | null;
  search: string;
  onSearchChange: (val: string) => void;
  category: string;
  onCategoryChange: (val: string) => void;
  subcategory: string;
  onSubcategoryChange: (val: string) => void;
  stockStatus: string;
  onStockStatusChange: (val: string) => void;
  attributeFilters: Record<string, string>;
  onToggleAttribute: (key: string, value: string) => void;
  onClearAll: () => void;
  locationId?: number | null;
  onLocationChange?: (val: number | null) => void;
  sortBy?: string;
  onSortChange?: (val: string) => void;
  filteredSummary?: StockOnHandFilteredSummary | null;
  searchPlaceholder?: string;
  showSummaryStrip?: boolean;
}

export default function InventoryCategoryAttributeFilterBar({
  facets,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  subcategory,
  onSubcategoryChange,
  stockStatus,
  onStockStatusChange,
  attributeFilters,
  onToggleAttribute,
  onClearAll,
  locationId,
  onLocationChange,
  sortBy,
  onSortChange,
  filteredSummary,
  searchPlaceholder = "Search SKU, name, barcode, material, size…",
  showSummaryStrip = true,
}: InventoryCategoryAttributeFilterBarProps) {
  const categoryOptions = useMemo(() => {
    if (facets?.category_tree && facets.category_tree.length > 0) {
      return facets.category_tree.map((c) => ({
        name: c.name,
        sku_count: c.sku_count,
        available_qty: c.available_qty,
        subcategories: c.subcategories,
      }));
    }
    return (facets?.categories ?? []).map((c) => ({
      name: c.name,
      sku_count: c.count,
      available_qty: undefined,
      subcategories: [],
    }));
  }, [facets]);

  const subcategoryOptions = useMemo(() => {
    if (facets?.category_tree && facets.category_tree.length > 0) {
      if (category !== "ALL") {
        const node = facets.category_tree.find(
          (c) => c.name.toLowerCase() === category.toLowerCase()
        );
        return node?.subcategories ?? [];
      }
      const merged: Array<{ name: string; sku_count: number; available_qty: string }> = [];
      for (const c of facets.category_tree) {
        for (const s of c.subcategories) {
          merged.push({
            name: s.name,
            sku_count: s.sku_count,
            available_qty: s.available_qty,
          });
        }
      }
      return merged;
    }
    return (facets?.subcategories ?? []).map((name) => ({
      name,
      sku_count: 0,
      available_qty: undefined,
    }));
  }, [facets, category]);

  const activeAttrEntries = Object.entries(attributeFilters).filter(([, v]) => Boolean(v));
  const hasActiveFilters = Boolean(
    search.trim() ||
      category !== "ALL" ||
      subcategory !== "ALL" ||
      stockStatus !== "all" ||
      Boolean(locationId) ||
      activeAttrEntries.length > 0
  );

  return (
    <div className="space-y-3">
      {/* Compact Filtered Scope Strip */}
      {showSummaryStrip && filteredSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Matching SKUs</div>
            <div className="text-base font-bold font-mono text-foreground">{filteredSummary.total_skus}</div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Physical (SOH)</div>
            <div className="text-base font-bold font-mono text-foreground">
              {parseFloat(filteredSummary.total_physical_qty).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reserved</div>
            <div className="text-base font-bold font-mono text-amber-600 dark:text-amber-400">
              {parseFloat(filteredSummary.total_reserved_qty).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Available (ATP)</div>
            <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-300">
              {parseFloat(filteredSummary.total_available_qty).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Health Split</div>
            <div className="text-xs font-semibold mt-0.5 flex flex-wrap gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">{filteredSummary.in_stock_count} ok</span>
              <span className="text-amber-600 dark:text-amber-400">{filteredSummary.low_stock_count} low</span>
              <span className="text-rose-600 dark:text-rose-400">{filteredSummary.out_of_stock_count} out</span>
            </div>
          </div>
          <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3.5 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">Stock Value</div>
            <div className="text-base font-bold font-mono text-violet-700 dark:text-violet-300">
              {formatDocumentMoney(filteredSummary.total_value)}
            </div>
          </div>
        </div>
      )}

      {/* Multi-Level Filter Toolbar */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 text-xs">
          {/* Search */}
          <div className="md:col-span-4 relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          {/* Category */}
          <div className="md:col-span-2">
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              aria-label="Filter by category"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.sku_count}
                  {c.available_qty !== undefined ? ` · ${parseFloat(c.available_qty).toFixed(0)} avail` : ""})
                </option>
              ))}
            </select>
          </div>

          {/* Subcategory */}
          <div className="md:col-span-2">
            <select
              value={subcategory}
              onChange={(e) => onSubcategoryChange(e.target.value)}
              aria-label="Filter by subcategory"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="ALL">All Subcategories</option>
              {subcategoryOptions.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                  {s.sku_count ? ` (${s.sku_count}${s.available_qty !== undefined ? ` · ${parseFloat(s.available_qty).toFixed(0)} avail` : ""})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status */}
          <div className="md:col-span-2">
            <select
              value={stockStatus}
              onChange={(e) => onStockStatusChange(e.target.value)}
              aria-label="Filter by stock status"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
            >
              <option value="all">All Stock Statuses</option>
              <option value="in_stock">In Stock (&gt;0 Units)</option>
              <option value="low_stock">Low Stock (&le; Reorder)</option>
              <option value="out_of_stock">Out of Stock (0 Units)</option>
              <option value="attention">Needs Attention (Low + Out)</option>
            </select>
          </div>

          {/* Location or Sort */}
          {onLocationChange && facets?.locations && facets.locations.length > 0 ? (
            <div className="md:col-span-2 relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={locationId ? String(locationId) : ""}
                onChange={(e) => onLocationChange(e.target.value ? Number(e.target.value) : null)}
                aria-label="Filter by location"
                className="w-full rounded-xl border border-border bg-background pl-7 pr-2.5 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">All Locations</option>
                {facets.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.location_type})
                  </option>
                ))}
              </select>
            </div>
          ) : onSortChange ? (
            <div className="md:col-span-2 relative">
              <SlidersHorizontal className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortBy || "code"}
                onChange={(e) => onSortChange(e.target.value)}
                aria-label="Sort stock items"
                className="w-full rounded-xl border border-border bg-background pl-7 pr-2.5 py-2 text-xs font-medium text-foreground focus:border-primary focus:outline-none"
              >
                <option value="code">Sort: Code / SKU</option>
                <option value="category">Sort: Category › Sub</option>
                <option value="available_desc">Sort: Highest Avail</option>
                <option value="available_asc">Sort: Lowest Avail</option>
                <option value="value_desc">Sort: Highest Value</option>
                <option value="shortage_desc">Sort: Critical First</option>
                <option value="name">Sort: Name A–Z</option>
              </select>
            </div>
          ) : null}
        </div>

        {/* Dynamic Attribute Facets Strip */}
        {(facets?.attribute_facets && facets.attribute_facets.length > 0) || hasActiveFilters ? (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-primary" />
                Attribute Breakdown &amp; Quick Filters
                {category !== "ALL" || subcategory !== "ALL"
                  ? ` (${subcategory !== "ALL" ? subcategory : category})`
                  : ""}
              </span>
              <div className="flex items-center gap-2">
                {onSortChange && onLocationChange && facets?.locations && facets.locations.length > 0 && (
                  <select
                    value={sortBy || "code"}
                    onChange={(e) => onSortChange(e.target.value)}
                    aria-label="Sort stock items"
                    className="rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="code">Sort: Code / SKU</option>
                    <option value="category">Sort: Category › Subcategory</option>
                    <option value="available_desc">Sort: Highest Available</option>
                    <option value="available_asc">Sort: Lowest Available</option>
                    <option value="value_desc">Sort: Highest Value</option>
                    <option value="shortage_desc">Sort: Most Critical</option>
                    <option value="name">Sort: Name A–Z</option>
                  </select>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={onClearAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-muted transition"
                  >
                    <X className="h-3 w-3" />
                    Clear All Filters
                  </button>
                )}
              </div>
            </div>

            {facets?.attribute_facets && facets.attribute_facets.length > 0 && (
              <div className="space-y-1.5">
                {facets.attribute_facets.slice(0, 6).map((attr) => (
                  <div key={attr.name} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[11px] font-semibold text-muted-foreground min-w-[78px]">
                      {attr.name}:
                    </span>
                    {attr.values.slice(0, 14).map((v) => {
                      const isActive =
                        (attributeFilters[attr.name] || "").toLowerCase() === v.value.toLowerCase();
                      const availNum = parseFloat(v.available_qty || "0");
                      return (
                        <button
                          key={`${attr.name}-${v.value}`}
                          type="button"
                          onClick={() => onToggleAttribute(attr.name, v.value)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium border transition cursor-pointer ${
                            isActive
                              ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold shadow-2xs"
                              : "border-border bg-background text-foreground/80 hover:text-foreground hover:bg-muted"
                          }`}
                          title={`${attr.name}: ${v.value} — ${v.sku_count} SKU(s), ${availNum.toFixed(0)} available`}
                        >
                          <span>{v.value}</span>
                          <span
                            className={`rounded px-1 py-0.2 font-mono text-[10px] ${
                              availNum > 0
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                            }`}
                          >
                            {availNum.toFixed(0)} avail · {v.sku_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Active Attribute Chips */}
            {activeAttrEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Filter className="h-3 w-3" /> Active Attributes:
                </span>
                {activeAttrEntries.map(([k, v]) => (
                  <span
                    key={`${k}-${v}`}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary"
                  >
                    {k}: {v}
                    <button
                      type="button"
                      onClick={() => onToggleAttribute(k, v)}
                      className="hover:opacity-75"
                      aria-label={`Remove ${k} filter`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
