"use client";

import { useState } from "react";
import { apiFetch, toArray } from "@/lib/api";

type Product = {
  id: number;
  name: string;
  product_code?: string;
  sku?: string;
  category?: string;
  subcategory?: string;
  base_price?: string;
  base_specs?: Record<string, string>;
  hsn_sac_code?: string;
  brand?: string;
  unit_of_measure?: string;
};

export default function ProductSearch({
  onSelect,
}: {
  onSelect: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);

  async function search(q: string) {
    setQuery(q);

    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    const data = await apiFetch(`/admin/products/search/?q=${encodeURIComponent(trimmed)}`);
    const payload = (data as { results?: unknown[] })?.results ?? data;
    setResults(toArray<Product>(payload));
  }

  return (
    <div className="space-y-1">
      <input
        className="rounded-md border px-3 py-2 text-sm w-full"
        placeholder="Search by name, code, or SKU"
        value={query}
        onChange={(e) => search(e.target.value)}
      />

      {results.length > 0 ? (
        <div className="border rounded bg-card shadow max-h-60 overflow-auto">
          {results.map((p) => (
            <div
              key={p.id}
              className="px-3 py-2.5 hover:bg-muted cursor-pointer text-sm border-b last:border-b-0"
              onClick={() => {
                onSelect(p.id);
                setQuery(p.name);
                setResults([]);
              }}
            >
              <div className="font-medium text-foreground">{p.name}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                {p.product_code && <span>Code: {p.product_code}</span>}
                {p.sku && <span>SKU: {p.sku}</span>}
                {p.category && <span>{p.category}{p.subcategory ? ` / ${p.subcategory}` : ""}</span>}
                {p.base_price && <span className="font-medium text-foreground">₹{p.base_price}</span>}
                {p.hsn_sac_code && <span>HSN: {p.hsn_sac_code}</span>}
                {p.unit_of_measure && <span>UOM: {p.unit_of_measure}</span>}
              </div>
              {p.base_specs && Object.keys(p.base_specs).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {Object.entries(p.base_specs).slice(0, 6).map(([key, val]) => (
                    <span
                      key={key}
                      className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {key}: {val}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
