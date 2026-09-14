"use client";

/**
 * ProductSpecSearch — the shared, professional product-search dropdown.
 *
 * Extracted from the direct-sale product-line picker so every product-pick
 * surface (subscription create, opening stock, finished goods, raw materials,
 * accessories, etc.) shows the same rich detail an operator needs to justify
 * which item: type badge (Finished Good / Raw Material / Accessory), code, name,
 * in/out-of-stock, price, on-hand qty, brand, HSN, attribute (spec) chips, and
 * the product's related accessories.
 *
 * Backed by /admin/billing/products/search/ with include_inventory=true, which
 * searches ALL products and returns the full spec + stock + eligibility flags.
 * The caller gets the whole row via onSelect and maps it to its own needs.
 */
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  searchAdminBillingProducts,
  type BillingProductSearchRow,
} from "@/services/direct-sale-workspace";

export type ProductSpecRow = BillingProductSearchRow;

function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function usableSpecs(specs: Record<string, string> | undefined | null): Array<[string, string]> {
  if (!specs) return [];
  return Object.entries(specs)
    .filter(([k, v]) => v && v !== "null" && !k.startsWith("__")) // drop internal keys like __pim_category_id
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)]);
}

export type ProductSpecSearchProps = {
  onSelect: (row: ProductSpecRow) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Restrict results to a stock item type (client-side filter). */
  itemType?: "FINISHED_GOOD" | "ACCESSORY" | "RAW_MATERIAL";
  /** Arbitrary client-side row filter (e.g. plan eligibility). Applied after itemType. */
  filterRow?: (row: ProductSpecRow) => boolean;
  /** Pass through the endpoint stock filter. */
  stock?: "all" | "in_stock" | "low_stock" | "out_of_stock";
  /** Only products enabled for direct sale. */
  directSaleOnly?: boolean;
  /** Include inactive products in results. */
  includeInactive?: boolean;
  /** Keep the typed text after a selection instead of clearing (default clears). */
  keepQueryOnSelect?: boolean;
  /** Extra classes for the text input. */
  inputClassName?: string;
};

export default function ProductSpecSearch({
  onSelect,
  placeholder = "Search by name, code, SKU, category…",
  disabled = false,
  autoFocus = false,
  className = "",
  itemType,
  filterRow,
  stock = "all",
  directSaleOnly = false,
  includeInactive = false,
  keepQueryOnSelect = false,
  inputClassName = "",
}: ProductSpecSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSpecRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const reqIdRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search; ignore stale (out-of-order) responses via a request id.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const data = await searchAdminBillingProducts({
          q: trimmed,
          stock,
          include_inventory: true,
          include_inactive: includeInactive || undefined,
          direct_sale_enabled: directSaleOnly || undefined,
          page_size: 25,
        });
        if (myReq !== reqIdRef.current) return; // a newer request superseded this one
        let rows = data.results ?? [];
        if (itemType) rows = rows.filter((r) => (r.stock_item_type ?? "FINISHED_GOOD") === itemType);
        if (filterRow) rows = rows.filter(filterRow);
        setResults(rows);
      } catch (err) {
        if (myReq !== reqIdRef.current) return;
        setError(err instanceof Error ? err.message : "Could not search products.");
        setResults([]);
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, stock, includeInactive, directSaleOnly, itemType]);

  // Close on outside click.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function handleSelect(row: ProductSpecRow) {
    onSelect(row);
    setOpen(false);
    if (keepQueryOnSelect) {
      setQuery(row.name);
    } else {
      setQuery("");
    }
    setResults([]);
  }

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label="Search products"
          className={`w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 ${inputClassName}`}
        />
      </div>

      {showDropdown ? (
        <div
          className="absolute z-[85] mt-1 w-full overflow-y-auto rounded-xl border-2 border-slate-300 shadow-[0_8px_32px_rgba(0,0,0,0.22)] dark:border-slate-600"
          style={{ maxHeight: "22rem" }}
        >
          <div className="overflow-hidden rounded-xl bg-white dark:bg-slate-900">
            {loading ? (
              <div className="flex items-center gap-2.5 px-4 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                Searching products…
              </div>
            ) : error ? (
              <div className="px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</div>
            ) : results.length ? (
              <ul className="divide-y-2 divide-slate-200 dark:divide-slate-700">
                {results.map((product) => {
                  const code = product.product_code || product.sku || `P-${product.id}`;
                  const inStock = product.inventory_status?.is_in_stock;
                  const stockQty = product.current_stock_qty ?? product.inventory_status?.available ?? 0;
                  const specs = usableSpecs(product.base_specs);
                  const accs = product.accessories ?? [];
                  const typeLabel =
                    product.stock_item_type === "ACCESSORY"
                      ? "Accessory"
                      : product.stock_item_type === "RAW_MATERIAL"
                        ? "Raw Material"
                        : "Finished Good";
                  const typeColor =
                    product.stock_item_type === "ACCESSORY"
                      ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                      : product.stock_item_type === "RAW_MATERIAL"
                        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onMouseDown={() => handleSelect(product)}
                        className="w-full px-4 py-3 text-left transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none dark:hover:bg-blue-950/40 dark:focus:bg-blue-950/40"
                      >
                        {/* Row 1: type badge + code + name + stock pill */}
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold ${typeColor}`}>
                            {typeLabel}
                          </span>
                          <span className="shrink-0 rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                            {code}
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-slate-900 dark:text-slate-100">
                            {product.name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              inStock
                                ? "border-green-400 bg-green-100 text-green-800 dark:border-green-600 dark:bg-green-900 dark:text-green-200"
                                : "border-red-400 bg-red-100 text-red-800 dark:border-red-600 dark:bg-red-900 dark:text-red-200"
                            }`}
                          >
                            {inStock ? "✓ In Stock" : "✗ Out of Stock"}
                          </span>
                        </div>

                        {/* Row 2: price · stock qty · brand · HSN */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 pl-0.5 text-[12px]">
                          <span className="font-bold text-slate-900 dark:text-white">{formatMoney(product.base_price)}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            Stock: <strong className="text-slate-800 dark:text-slate-200">{stockQty}</strong>{" "}
                            {product.unit_of_measure || "PCS"}
                          </span>
                          {product.brand && <span className="text-slate-500 dark:text-slate-400">{product.brand}</span>}
                          {product.hsn_sac_code && (
                            <span className="font-mono text-slate-500 dark:text-slate-400">HSN {product.hsn_sac_code}</span>
                          )}
                          {product.category && (
                            <span className="text-slate-400 dark:text-slate-500">
                              {product.category}
                              {product.subcategory ? ` / ${product.subcategory}` : ""}
                            </span>
                          )}
                        </div>

                        {/* Row 3: spec (attribute) chips */}
                        {specs.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1 pl-0.5">
                            {specs.map(([k, v]) => (
                              <span
                                key={k}
                                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                              >
                                <span className="font-normal text-slate-400 dark:text-slate-500">{k}: </span>
                                {v}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Row 4: related accessories */}
                        {accs.length > 0 && (
                          <div className="mt-2 overflow-hidden rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/60">
                            <div className="flex items-center gap-1.5 border-b border-blue-200 bg-blue-100 px-2.5 py-1 dark:border-blue-700 dark:bg-blue-900">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">
                                📦 {accs.length} Related Accessor{accs.length === 1 ? "y" : "ies"}
                              </span>
                            </div>
                            <div className="divide-y divide-blue-100 dark:divide-blue-800">
                              {accs.map((a) => (
                                <div key={a.id} className="flex items-center gap-2 px-2.5 py-1.5">
                                  <span className="shrink-0 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                    {a.product_code || a.sku || `#${a.id}`}
                                  </span>
                                  <span className="flex-1 text-[12px] font-semibold text-slate-800 dark:text-slate-200">{a.name}</span>
                                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                                    Qty: <strong className="text-slate-700 dark:text-slate-300">{a.quantity}</strong>
                                  </span>
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      a.included_in_price
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
                                    }`}
                                  >
                                    {a.included_in_price ? "Included" : "Add-on cost"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-4 text-sm text-slate-500 dark:text-slate-400">
                No products found — try a product name, code, or SKU.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
