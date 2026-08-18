"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, X } from "lucide-react";

type ModuleSearchProps = {
  modules: Array<{ key: string; label: string; description: string }>;
  onFilter: (filtered: string[]) => void;
  placeholder?: string;
  className?: string;
};

export default function ModuleSearch({
  modules,
  onFilter,
  placeholder = "Search modules...",
  className,
}: ModuleSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    const categoryMap: Record<string, string[]> = {
      "Finance & Collections": ["finance", "accounting"],
      "Billing & Invoicing": ["billing", "contracts", "invoices"],
      "Sales & CRM": ["sales", "crm", "leads"],
      "Inventory & Supply": ["inventory", "warehouse"],
      "Operations & Delivery": ["delivery", "operations"],
      "Control & Governance": ["control", "data-quality"],
      "Analytics & Setup": ["reports", "business-setup"],
      "Admin Tools": ["global-search", "notifications"],
    };

    Object.entries(categoryMap).forEach(([cat, keys]) => {
      if (keys.some(k => modules.some(m => m.key === k))) {
        cats.add(cat);
      }
    });

    return Array.from(cats);
  }, [modules]);

  const filtered = useMemo(() => {
    let results = modules;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        m =>
          m.label.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      );
    }

    if (selectedCategory) {
      const categoryMap: Record<string, string[]> = {
        "Finance & Collections": ["finance", "accounting"],
        "Billing & Invoicing": ["billing", "contracts", "invoices"],
        "Sales & CRM": ["sales", "crm", "leads"],
        "Inventory & Supply": ["inventory", "warehouse"],
        "Operations & Delivery": ["delivery", "operations"],
        "Control & Governance": ["control", "data-quality"],
        "Analytics & Setup": ["reports", "business-setup"],
        "Admin Tools": ["global-search", "notifications"],
      };

      const categoryKeys = categoryMap[selectedCategory] || [];
      results = results.filter(m => categoryKeys.includes(m.key));
    }

    return results;
  }, [searchQuery, selectedCategory, modules]);

  // Update filter separately to avoid setState in render
  useEffect(() => {
    onFilter(filtered.map(m => m.key));
  }, [filtered, onFilter]);

  const isFiltered = searchQuery.trim() !== "" || selectedCategory !== null;

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-border bg-background pl-10 pr-10 py-2.5 text-sm outline-none transition focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedCategory === null
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All ({modules.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedCategory === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results Info */}
      {isFiltered && (
        <div className="text-xs text-muted-foreground">
          Found {filtered.length} of {modules.length} modules
          {selectedCategory && ` in "${selectedCategory}"`}
        </div>
      )}
    </div>
  );
}
