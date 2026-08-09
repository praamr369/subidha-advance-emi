"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Search, X } from "lucide-react";
import type { InventoryItem } from "@/services/inventory";

interface SearchableItemSelectProps {
  value: string | number;
  onChange: (value: string) => void;
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
            <ul className="divide-y divide-border">
              {filteredItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(String(item.id));
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full px-3 py-2.5 text-left text-sm hover:bg-primary/10 transition-colors ${
                      String(item.id) === String(value) ? "bg-primary/20 border-l-2 border-l-primary" : ""
                    }`}
                  >
                    <div className="font-medium text-foreground">{item.product_code}</div>
                    <div className="text-xs text-foreground/70 mt-0.5">
                      {item.product_name} {item.sku ? `(${item.sku})` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
