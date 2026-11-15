"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, X, Loader2, PackageCheck } from "lucide-react";
import { searchInventoryItems, type InventoryItem } from "@/services/inventory";

export interface SearchableItemSelectProps {
  value: string | number | null | undefined;
  onChange: (value: string, item?: InventoryItem) => void;
  onLoadItems?: (search: string) => Promise<InventoryItem[]>;
  allItems?: InventoryItem[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  initialLabel?: string;
  required?: boolean;
  id?: string;
  autoFocus?: boolean;
}

function formatItemLabel(item: InventoryItem): string {
  const code = item.product_code || item.sku || "";
  const name = item.product_name || item.name || "";
  if (code && name) {
    if (name.toLowerCase().includes(code.toLowerCase())) {
      return name;
    }
    return `${code} · ${name}`;
  }
  return name || code || (item.id ? `Item #${item.id}` : "");
}

function getItemBadgeStyle(type?: string): { label: string; cls: string } {
  switch (type?.toUpperCase()) {
    case "ACCESSORY":
      return {
        label: "Accessory",
        cls: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300",
      };
    case "RAW_MATERIAL":
      return {
        label: "Raw Material",
        cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
      };
    case "FINISHED_GOOD":
      return {
        label: "Finished Good",
        cls: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
      };
    case "SERVICE":
      return {
        label: "Service",
        cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
      };
    default:
      return {
        label: type || "Item",
        cls: "border-border bg-muted/60 text-muted-foreground",
      };
  }
}

export default function SearchableItemSelect({
  value,
  onChange,
  onLoadItems,
  allItems = [],
  disabled = false,
  className = "",
  placeholder = "Search product by name, SKU, code…",
  initialLabel,
  required = false,
  id,
  autoFocus = false,
}: SearchableItemSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [remoteResults, setRemoteResults] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [itemCache, setItemCache] = useState<Map<string, InventoryItem>>(() => new Map());

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebounce(search, 250);

  // Sync passed allItems into cache
  useEffect(() => {
    if (!allItems.length) return;
    setItemCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const item of allItems) {
        const key = String(item.id);
        if (!next.has(key)) {
          next.set(key, item);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allItems]);

  // Find currently selected item from allItems, cache, or remoteResults
  const selectedItem = useMemo(() => {
    if (!value || value === "0") return null;
    const strVal = String(value);
    const fromAll = allItems.find((it) => String(it.id) === strVal);
    if (fromAll) return fromAll;
    const fromRemote = remoteResults.find((it) => String(it.id) === strVal);
    if (fromRemote) return fromRemote;
    return itemCache.get(strVal) ?? null;
  }, [value, allItems, remoteResults, itemCache]);

  // Combined pool of known items: deduplicate allItems and remoteResults
  const combinedItems = useMemo(() => {
    const map = new Map<number, InventoryItem>();
    // First remote results (most relevant for current search)
    for (const it of remoteResults) {
      map.set(it.id, it);
    }
    // Then parent-provided items
    for (const it of allItems) {
      if (!map.has(it.id)) map.set(it.id, it);
    }
    // Then cached items
    itemCache.forEach((it) => {
      if (!map.has(it.id)) map.set(it.id, it);
    });
    return Array.from(map.values());
  }, [remoteResults, allItems, itemCache]);

  // Filter items based on user search
  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return combinedItems.slice(0, 80);
    }
    const terms = q.split(/\s+/).filter(Boolean);
    return combinedItems
      .filter((it) => {
        const name = (it.product_name || it.name || "").toLowerCase();
        const code = (it.product_code || "").toLowerCase();
        const sku = (it.sku || "").toLowerCase();
        const cat = (it.category || "").toLowerCase();
        const sub = (it.subcategory || "").toLowerCase();
        const fullText = `${name} ${code} ${sku} ${cat} ${sub}`;
        return terms.every((t) => fullText.includes(t));
      })
      .slice(0, 80);
  }, [combinedItems, search]);

  // Trigger remote search when user types
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || q.length < 1) {
      setRemoteResults([]);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);

    const executeSearch = onLoadItems
      ? onLoadItems(q)
      : searchInventoryItems(q).then((res) => res.results || []);

    executeSearch
      .then((items) => {
        if (!active) return;
        setRemoteResults(items || []);
        // Cache found items
        setItemCache((prev) => {
          const next = new Map(prev);
          for (const item of items || []) {
            next.set(String(item.id), item);
          }
          return next;
        });
      })
      .catch(() => {
        if (!active) return;
        setRemoteResults([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, onLoadItems]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
        setHighlightIndex(-1);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < visibleItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : visibleItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < visibleItems.length) {
        handleSelectItem(visibleItems[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearch("");
      setHighlightIndex(-1);
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightIndex]);

  function handleSelectItem(item: InventoryItem) {
    // Cache selected item
    setItemCache((prev) => new Map(prev).set(String(item.id), item));
    onChange(String(item.id), item);
    setIsOpen(false);
    setSearch("");
    setHighlightIndex(-1);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("", undefined);
    setSearch("");
    setIsOpen(false);
    setHighlightIndex(-1);
    inputRef.current?.focus();
  }

  // Determine what is displayed inside the input
  const displaySelectedText = selectedItem
    ? formatItemLabel(selectedItem)
    : initialLabel || (value && value !== "0" ? `Item #${value}` : "");

  const inputValue = isOpen ? search : displaySelectedText;

  const effectivePlaceholder = isOpen && displaySelectedText ? displaySelectedText : placeholder;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/70" />
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          value={inputValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={effectivePlaceholder}
          className={`h-9 w-full rounded-xl border border-border bg-background pl-8 pr-8 text-sm text-foreground transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        />

        {/* Clear selection / search button */}
        {(value || search) && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            title="Clear item selection"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Hidden input for HTML form validation if required */}
      {required ? (
        <input
          type="text"
          className="sr-only"
          tabIndex={-1}
          value={value ? String(value) : ""}
          required
          readOnly
          aria-hidden="true"
        />
      ) : null}

      {/* Dropdown results popup */}
      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-72 w-full min-w-[340px] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl">
          {/* Status bar when searching backend */}
          {isLoading ? (
            <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              Searching full product catalog…
            </div>
          ) : null}

          <div ref={listRef} className="max-h-64 overflow-y-auto divide-y divide-border/40">
            {visibleItems.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {isLoading ? (
                  "Loading catalog products…"
                ) : search.trim() ? (
                  <div>
                    <p className="font-medium text-foreground">No products found</p>
                    <p className="mt-0.5 text-[11px]">No items match &ldquo;{search}&rdquo;</p>
                  </div>
                ) : (
                  "No inventory items available."
                )}
              </div>
            ) : (
              visibleItems.map((item, idx) => {
                const code = item.product_code || item.sku || `#${item.id}`;
                const name = item.product_name || item.name || code;
                const badge = getItemBadgeStyle(item.stock_item_type);
                const isSelected = String(item.id) === String(value);
                const isHighlighted = idx === highlightIndex;
                const cost = item.purchase_unit_cost || item.standard_unit_cost;
                const stockQty = item.physical_qty ?? item.available_qty ?? item.current_stock_qty;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectItem(item);
                    }}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={`flex w-full flex-col px-3.5 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : isHighlighted
                        ? "bg-muted text-foreground"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                        {code}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                        {name}
                      </span>
                      {isSelected ? (
                        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {cost ? (
                        <span className="font-semibold text-foreground">
                          ₹{Number(cost).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <span className="font-normal text-muted-foreground">/unit</span>
                        </span>
                      ) : null}
                      {stockQty != null ? (
                        <span>
                          Stock: <strong className="text-foreground">{stockQty}</strong> {item.unit_of_measure || "PCS"}
                        </span>
                      ) : item.unit_of_measure ? (
                        <span>Unit: {item.unit_of_measure}</span>
                      ) : null}
                      {item.category ? (
                        <span className="truncate">
                          {item.category}
                          {item.subcategory ? ` › ${item.subcategory}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
