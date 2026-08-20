"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Package, CheckCircle, Tag, X } from "lucide-react";
import { apiFetch, toArray } from "@/lib/api";

type PlanType = "EMI" | "RENT" | "LEASE" | "DIRECT_SALE";

export type ProductOption = {
  id: number;
  name: string;
  product_code?: string;
  sku?: string;
  base_price?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  hsn_sac_code?: string;
  unit_of_measure?: string;
  base_specs?: Record<string, string>;
  is_emi_enabled?: boolean;
  is_rent_enabled?: boolean;
  is_lease_enabled?: boolean;
  is_direct_sale_enabled?: boolean;
  lifecycle_status?: string;
  on_hand_qty?: string;
  reserved_qty?: string;
  available_qty?: string;
  stock_status?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "FULLY_RESERVED";
};

type ProductSelectorProps = {
  onSelect: (product: ProductOption) => void;
  onClear?: () => void;
  selected?: ProductOption | null;
  planFilter?: PlanType | null;
  disabled?: boolean;
  placeholder?: string;
};

function toMoneyString(value: unknown): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeProduct(raw: Record<string, unknown>): ProductOption {
  return {
    id: toNumber(raw.id),
    name: String(raw.name ?? ""),
    product_code: toOptionalString(raw.product_code),
    sku: toOptionalString(raw.sku),
    base_price: toMoneyString(raw.base_price),
    category: toOptionalString(raw.category),
    subcategory: toOptionalString(raw.subcategory),
    brand: toOptionalString(raw.brand),
    hsn_sac_code: toOptionalString(raw.hsn_sac_code),
    unit_of_measure: toOptionalString(raw.unit_of_measure),
    base_specs: (raw.base_specs && typeof raw.base_specs === "object" && !Array.isArray(raw.base_specs))
      ? raw.base_specs as Record<string, string>
      : undefined,
    is_emi_enabled: typeof raw.is_emi_enabled === "boolean" ? raw.is_emi_enabled : undefined,
    is_rent_enabled: typeof raw.is_rent_enabled === "boolean" ? raw.is_rent_enabled : undefined,
    is_lease_enabled: typeof raw.is_lease_enabled === "boolean" ? raw.is_lease_enabled : undefined,
    is_direct_sale_enabled:
      typeof raw.is_direct_sale_enabled === "boolean" ? raw.is_direct_sale_enabled : undefined,
    lifecycle_status: toOptionalString(raw.lifecycle_status),
  };
}

function ProductResultCard({
  product,
  onSelect,
}: {
  product: ProductOption;
  onSelect: () => void;
}) {
  return (
    <div
      className="cursor-pointer rounded-xl border border-border p-4 transition-colors hover:border-ring hover:bg-accent/30"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {product.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {product.product_code && (
              <span className="flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {product.product_code}
              </span>
            )}
            {product.sku && (
              <span>SKU: {product.sku}</span>
            )}
            {product.category && (
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" />
                {product.category}{product.subcategory ? ` / ${product.subcategory}` : ""}
              </span>
            )}
            {product.brand && <span>{product.brand}</span>}
            {product.hsn_sac_code && <span>HSN: {product.hsn_sac_code}</span>}
            <span className="font-medium text-foreground">
              ₹{product.base_price}
            </span>
          </div>
          {product.base_specs && Object.keys(product.base_specs).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(product.base_specs).slice(0, 5).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {k}: {v}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Select
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ProductSelector({
  onSelect,
  onClear,
  selected,
  planFilter,
  disabled = false,
  placeholder = "Search product by name, code, or category…",
}: ProductSelectorProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setResults([]);
        setError(null);
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const payload = await apiFetch<unknown>(
          `/admin/products/search/?q=${encodeURIComponent(term.trim())}`
        );
        const normalized = toArray<Record<string, unknown>>(payload).map(normalizeProduct);
        const filtered = normalized.filter((item) => {
          if (item.lifecycle_status === "DISCONTINUED") return false;
          if (planFilter === "EMI") return Boolean(item.is_emi_enabled);
          if (planFilter === "RENT") return Boolean(item.is_rent_enabled);
          if (planFilter === "LEASE") return Boolean(item.is_lease_enabled);
          if (planFilter === "DIRECT_SALE") return Boolean(item.is_direct_sale_enabled);
          return true;
        });
        setResults(filtered);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error searching products");
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [planFilter]
  );

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 300);
  };

  const handleSelect = (product: ProductOption) => {
    setQuery("");
    setResults([]);
    onSelect(product);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-emerald-900">{selected.name}</div>
            <div className="text-xs text-emerald-700">
              {selected.product_code ? `${selected.product_code} • ` : ""}
              ₹{selected.base_price}
            </div>
          </div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground outline-none transition focus:border-[var(--surface-border-strong)] focus:ring-2 focus:ring-[var(--ring)]/35 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {searching && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          </div>
        )}
      </div>

      {error && <div className="mt-2 text-xs font-medium text-destructive">{error}</div>}

      {!searching && query.trim() && results.length === 0 && !error && (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">No products found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            No active products matched &quot;{query}&quot;{planFilter ? ` for ${planFilter}` : ""}.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {results.map((product) => (
            <ProductResultCard
              key={product.id}
              product={product}
              onSelect={() => handleSelect(product)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
