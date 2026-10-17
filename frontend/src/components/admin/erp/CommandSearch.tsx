"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";

import { LinkedRecordCard } from "@/components/admin/erp/LinkedRecordCard";
import { searchAdminGlobal, type AdminGlobalSearchResult } from "@/services/admin-erp";

export function CommandSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminGlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  // Debounced auto-search (250ms) for fast query indexing feedback
  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      return;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void searchAdminGlobal(query.trim())
        .then((response) => {
          if (!active) return;
          setResults(response.results);
        })
        .catch(() => {
          if (!active) return;
          setResults([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, canSearch]);

  async function handleManualSearch(bypassCache = false) {
    if (!canSearch) return;
    setLoading(true);
    try {
      const response = await searchAdminGlobal(query.trim(), { bypassCache });
      setResults(response.results);
    } finally {
      setLoading(false);
    }
  }

  // Group categories dynamically
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.type) set.add(r.type);
    }
    return ["ALL", ...Array.from(set)];
  }, [results]);

  const filteredResults = useMemo(() => {
    if (activeCategory === "ALL") return results;
    return results.filter((r) => r.type === activeCategory);
  }, [results, activeCategory]);

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Command Search</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Search customer, subscription, lucky ID, invoice, receipt, direct sale, product, partner, and lead records.
          </p>
        </div>
        {canSearch && (
          <button
            type="button"
            onClick={() => void handleManualSearch(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            title="Force refresh cache"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleManualSearch(false);
            }}
            placeholder="Search by phone, number, SKU, invoice..."
            className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleManualSearch(false)}
          disabled={!canSearch || loading}
          className="rounded-xl border border-amber-900/20 bg-amber-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {categories.length > 2 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-md px-2.5 py-0.5 text-xs font-medium transition ${
                activeCategory === cat
                  ? "bg-amber-900 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat.toUpperCase()} {cat !== "ALL" && `(${results.filter((r) => r.type === cat).length})`}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-2">
        {filteredResults.map((item) => (
          <LinkedRecordCard
            key={`${item.type}-${item.title}-${item.deep_link}`}
            title={`${item.title} (${item.type})`}
            subtitle={item.subtitle}
            status={item.status}
            href={item.deep_link}
          />
        ))}
        {canSearch && !loading && results.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No matching records found for &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </section>
  );
}
