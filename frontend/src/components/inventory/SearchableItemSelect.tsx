"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, X } from "lucide-react";
import type { InventoryItem } from "@/services/inventory";

interface SearchableItemSelectProps {
  value: string | number;
  onChange: (value: string, item?: InventoryItem) => void;
  onLoadItems?: (search: string) => Promise<InventoryItem[]>;
  allItems?: InventoryItem[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export default function SearchableItemSelect({
  value,
  onChange,
  onLoadItems,
  allItems = [],
  disabled = false,
  className = "",
  placeholder = "Search or select inventory item...",
}: SearchableItemSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [filteredItems, setFilteredItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, 300);

  // Load items from backend when search changes
  useEffect(() => {
    if (!onLoadItems) {
      // Client-side filtering if no API provided
      const filtered = allItems.filter(
        (item) =>
          item.product_code?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          item.product_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
          item.sku?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
      setFilteredItems(filtered.slice(0, 100)); // Limit to 100 visible
    } else {
      // API-based search
      setIsLoading(true);
      onLoadItems(debouncedSearch)
        .then((items) => setFilteredItems(items.slice(0, 100)))
        .catch(() => setFilteredItems([]))
        .finally(() => setIsLoading(false));
    }
  }, [debouncedSearch, onLoadItems, allItems]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedItem = useMemo(
    () => (allItems || []).find((item) => String(item.id) === String(value)),
    [value, allItems]
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60 pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? search : selectedItem ? `${selectedItem.product_code} - ${selectedItem.product_name}` : ""}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className={`h-10 w-full rounded-xl border-2 border-border bg-background text-foreground pl-9 pr-9 text-sm placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
        />
        {isOpen && search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-foreground z-10 hover:bg-muted rounded-md p-1 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-60 overflow-y-auto rounded-xl border-2 border-border bg-background shadow-xl">
          {isLoading ? (
            <div className="p-3 text-center text-sm text-foreground/70 font-medium">Loading items...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-3 text-center text-sm text-foreground/70">
              {search ? "❌ No items found" : "🔍 Start typing to search"}
            </div>
          ) : (
            <ul className="divide-y-2 divide-border">
              {filteredItems.map((item) => {
                const code = item.product_code || item.sku || `#${item.id}`;
                const name = item.product_name || item.name || code;
                const t = item.stock_item_type;
                const typeLabel =
                  t === "ACCESSORY" ? "Accessory" : t === "RAW_MATERIAL" ? "Raw Material" : t === "FINISHED_GOOD" ? "Finished Good" : (t || "Item");
                const typeColor =
                  t === "ACCESSORY"
                    ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                    : t === "RAW_MATERIAL"
                      ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
                const stockQty = item.physical_qty ?? item.available_qty ?? item.current_stock_qty;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(String(item.id), item);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-950/40 ${
                        String(item.id) === String(value) ? "bg-blue-50 dark:bg-blue-950/40" : ""
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${typeColor}`}>{typeLabel}</span>
                        <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">{code}</span>
                        <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-900 dark:text-slate-100">{name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 pl-0.5 text-[12px]">
                        {item.standard_unit_cost ? (
                          <span className="font-bold text-slate-900 dark:text-white">₹{Number(item.standard_unit_cost).toLocaleString("en-IN")}<span className="font-normal text-slate-400">/unit</span></span>
                        ) : null}
                        {stockQty != null ? (
                          <span className="text-slate-500 dark:text-slate-400">Stock: <strong className="text-slate-800 dark:text-slate-200">{stockQty}</strong> {item.unit_of_measure || "PCS"}</span>
                        ) : item.unit_of_measure ? (
                          <span className="text-slate-500 dark:text-slate-400">Unit: {item.unit_of_measure}</span>
                        ) : null}
                        {item.category ? (
                          <span className="text-slate-400 dark:text-slate-500">{item.category}{item.subcategory ? ` › ${item.subcategory}` : ""}</span>
                        ) : null}
                        {item.sku && code !== item.sku ? (
                          <span className="font-mono text-slate-400 dark:text-slate-500">SKU {item.sku}</span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
