"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Search, Package, ChevronRight } from "lucide-react";

import EmptyState from "@/components/feedback/EmptyState";
import ErrorState from "@/components/feedback/ErrorState";
import LoadingBlock from "@/components/feedback/LoadingBlock";
import { listCatalogProducts, type CatalogProduct } from "@/services/catalog";
import { formatRupee } from "@/lib/utils/currency";

export default function PartnerCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [count, setCount] = useState(0);

  const loadCatalog = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);

    try {
      const response = await listCatalogProducts("partner", {
        search: appliedSearch || undefined,
        pageSize: 60,
      });
      setProducts(response.results);
      setCount(response.count ?? response.results.length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog.");
      setProducts([]);
      setCount(0);
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    void loadCatalog("initial");
  }, [loadCatalog]);

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  function handleReset() {
    setSearchInput("");
    setAppliedSearch("");
  }

  return (
    <div className="flex flex-col p-4 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Catalog</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse admin-approved products
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadCatalog("refresh")}
          disabled={refreshing}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats Summary */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Package className="size-5" />
        </div>
        <div>
          <div className="text-xl font-bold text-foreground">{count}</div>
          <div className="text-xs font-medium text-muted-foreground">Total Products</div>
        </div>
      </div>

      {/* Search & Filters */}
      <form onSubmit={handleApplyFilters} className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products..."
            className="h-12 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground active:scale-95"
          >
            Apply
          </button>
          {appliedSearch && (
            <button
              type="button"
              onClick={handleReset}
              className="h-10 rounded-xl border border-border bg-card px-4 text-sm font-bold text-foreground active:scale-95"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="space-y-3">
        {loading ? (
          <LoadingBlock label="Loading catalog..." />
        ) : error ? (
          <ErrorState title="Error" description={error} onRetry={() => void loadCatalog("initial")} />
        ) : count === 0 ? (
          <EmptyState
            title="No products found"
            description={appliedSearch ? "No products matched your search." : "Catalog is empty."}
          />
        ) : (
          products.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                  {row.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={row.image} alt={row.name} className="h-full w-full object-cover" />
                    </>
                  ) : (
                    <Package className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-foreground truncate">{row.name}</div>
                  <div className="mt-0.5 text-xs font-medium text-muted-foreground">{row.category || "Uncategorised"}</div>
                  <div className="mt-2 text-sm font-bold text-foreground">
                    {formatRupee(row.base_price)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Link
                  href={`/partner/catalog/${row.id}`}
                  className="flex-1 min-w-[100px] text-center rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition active:scale-95"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
