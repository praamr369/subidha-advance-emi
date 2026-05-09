"use client";

import { useState } from "react";

import {
  type DirectSalePreviewResponse,
  previewCashierDirectSaleBilling,
  searchCashierBillingProducts,
  type BillingProductSearchRow,
} from "@/services/direct-sale-workspace";

export default function CashierDirectSaleBillingPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BillingProductSearchRow[]>([]);
  const [preview, setPreview] = useState<DirectSalePreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const payload = await searchCashierBillingProducts({ q: query, stock: "all" });
      setRows(payload.results);
    } finally {
      setLoading(false);
    }
  }

  async function previewSingle(row: BillingProductSearchRow) {
    const payload = await previewCashierDirectSaleBilling({
      lines: [{ product_id: row.id, quantity: 1, unit_price: Number(row.sale_price || row.base_price || 0) }],
      paid_amount: 0,
    });
    setPreview(payload);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4">
        <h1 className="text-xl font-semibold">Cashier Direct Sale Billing</h1>
        <p className="text-sm text-muted-foreground">Fast catalog search with out-of-stock warning and requirement preview for front-desk operation.</p>
      </section>
      <section className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex gap-2">
          <input className="w-full rounded-xl border px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search catalog by name, code, SKU..." />
          <button className="rounded-xl border px-3 py-2 text-sm" type="button" onClick={search} disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        </div>
        <div className="max-h-96 overflow-auto space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border p-3 flex items-center justify-between">
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.sku || row.product_code} · Stock {row.inventory_status.available}</p>
              </div>
              <div className="flex items-center gap-2">
                {!row.inventory_status.is_in_stock ? <span className="text-xs rounded-full bg-amber-100 px-2 py-1 text-amber-700">OUT OF STOCK</span> : null}
                <button className="rounded-xl border px-2 py-1 text-xs" type="button" onClick={() => previewSingle(row)}>Preview</button>
              </div>
            </div>
          ))}
        </div>
        {!rows.length ? <p className="text-sm text-muted-foreground">Search to load full direct-sale product catalog.</p> : null}
      </section>
      {preview?.stock_warnings?.length ? (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {preview.stock_warnings[0].message}
        </section>
      ) : null}
    </div>
  );
}
