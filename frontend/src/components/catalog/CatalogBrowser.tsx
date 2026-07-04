"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import { WorkspaceSection } from "@/components/ui/workspace";
import { formatRupee } from "@/lib/utils/currency";
import {
  getCatalogFacets,
  listCatalogProducts,
  type CatalogFacets,
  type CatalogProduct,
  type CatalogPurposeKey,
  type CatalogRole,
} from "@/services/catalog";

export type CatalogCta = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

export type CatalogBrowserProps = {
  role: CatalogRole;
  /** Build the action links shown on each product card (empty = read-only). */
  buildCtas?: (product: CatalogProduct) => CatalogCta[];
  /** Optional note rendered above the grid (role-specific guidance). */
  helperNote?: string;
};

const PURPOSE_BADGE_STYLES: Record<CatalogPurposeKey, string> = {
  emi: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  rent: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
  lease: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  direct_sale: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  purchase_request: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

const ALL_PURPOSES = "";

export default function CatalogBrowser({ role, buildCtas, helperNote }: CatalogBrowserProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [purpose, setPurpose] = useState<CatalogPurposeKey | "">(ALL_PURPOSES);
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [appliedSearch, setAppliedSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getCatalogFacets(role)
      .then((data) => {
        if (active) setFacets(data);
      })
      .catch(() => {
        /* facets are best-effort; grid still loads */
      });
    return () => {
      active = false;
    };
  }, [role]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await listCatalogProducts(role, {
        purpose: purpose || undefined,
        category: category || undefined,
        search: appliedSearch || undefined,
        pageSize: 60,
      });
      setProducts(response.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [role, purpose, category, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const purposeFilters = useMemo(() => {
    const base: { key: CatalogPurposeKey | ""; label: string; count: number | null }[] = [
      { key: ALL_PURPOSES, label: "All", count: facets?.total ?? null },
    ];
    for (const p of facets?.purposes ?? []) {
      base.push({ key: p.key, label: p.label, count: p.count });
    }
    return base;
  }, [facets]);

  return (
    <WorkspaceSection
      title="Approved product catalog"
      description={
        helperNote ??
        "Browse products the admin has approved. Each product shows the business purposes it supports."
      }
    >
      {/* Filter rail */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {purposeFilters.map((p) => (
            <button
              key={p.key || "all"}
              type="button"
              onClick={() => setPurpose(p.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                purpose === p.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {p.label}
              {p.count != null ? (
                <span className="rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/10">
                  {p.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          >
            <option value="">All categories</option>
            {(facets?.categories ?? []).map((cat) => (
              <option key={cat.name} value={cat.name}>
                {cat.name} ({cat.count})
              </option>
            ))}
          </select>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products…"
              className="h-9 w-56 rounded-lg border border-border bg-background px-3 text-sm"
            />
            <button
              type="submit"
              className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {loading ? <ERPLoadingState label="Loading catalog…" /> : null}
      {!loading && error ? (
        <ERPErrorState title="Unable to load catalog" description={error} onRetry={() => void load()} />
      ) : null}
      {!loading && !error && products.length === 0 ? (
        <ERPEmptyState
          title="No products found"
          description="No approved products match the selected filters."
        />
      ) : null}

      {!loading && !error && products.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const ctas = buildCtas?.(product) ?? [];
            return (
              <div
                key={product.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="flex aspect-video items-center justify-center bg-muted/40">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">
                      {product.category || "Product"}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {product.category || "Uncategorised"}
                      </p>
                      <h3 className="text-sm font-semibold text-foreground">{product.name}</h3>
                    </div>
                    <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                      {formatRupee(product.base_price)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {product.purposes.map((p) => (
                      <span
                        key={p.key}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PURPOSE_BADGE_STYLES[p.key]}`}
                      >
                        {p.label}
                      </span>
                    ))}
                  </div>
                  {product.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>
                  ) : null}
                  {ctas.length > 0 ? (
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      {ctas.map((cta) => (
                        <Link
                          key={cta.href + cta.label}
                          href={cta.href}
                          className={`inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium ${
                            cta.variant === "secondary"
                              ? "border border-border hover:bg-muted"
                              : "bg-primary text-primary-foreground hover:opacity-90"
                          }`}
                        >
                          {cta.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </WorkspaceSection>
  );
}
