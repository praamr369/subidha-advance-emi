"use client";

import { useMemo, useState } from "react";

import { createDirectSale } from "@/services/billing";
import {
  type DirectSalePreviewResponse,
  previewAdminDirectSaleBilling,
  searchAdminBillingProducts,
  type BillingProductSearchRow,
} from "@/services/direct-sale-workspace";

type CartLine = {
  product: BillingProductSearchRow;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
};

export default function AdminDirectSaleBillingWorkspacePage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<BillingProductSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [preview, setPreview] = useState<DirectSalePreviewResponse | null>(null);
  const [message, setMessage] = useState<string>("");
  const [busySubmit, setBusySubmit] = useState(false);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((acc, line) => acc + line.quantity * line.unitPrice, 0);
    return {
      subtotal: subtotal.toFixed(2),
      grandTotal: subtotal.toFixed(2),
    };
  }, [cart]);

  async function runSearch() {
    setLoading(true);
    setMessage("");
    try {
      const payload = await searchAdminBillingProducts({ q: query, stock: stockFilter, include_inactive: true });
      setRows(payload.results);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to search products.");
    } finally {
      setLoading(false);
    }
  }

  function addProduct(row: BillingProductSearchRow) {
    setCart((previous) => {
      const index = previous.findIndex((line) => line.product.id === row.id);
      if (index >= 0) {
        const next = [...previous];
        next[index] = { ...next[index], quantity: next[index].quantity + 1 };
        return next;
      }
      return [...previous, { product: row, quantity: 1, unitPrice: Number(row.sale_price || row.base_price || 0), discountAmount: 0 }];
    });
  }

  async function openPreview() {
    if (!cart.length) return;
    const payload = await previewAdminDirectSaleBilling({
      lines: cart.map((line) => ({
        product_id: line.product.id,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        discount_amount: line.discountAmount,
        tax_rate: 0,
      })),
      paid_amount: 0,
    });
    setPreview(payload);
  }

  async function submitDraft() {
    if (!cart.length || busySubmit) return;
    setBusySubmit(true);
    setMessage("");
    try {
      await createDirectSale({
        sale_date: new Date().toISOString().slice(0, 10),
        subtotal: totals.subtotal,
        discount_total: "0.00",
        taxable_total: totals.subtotal,
        tax_total: "0.00",
        grand_total: totals.grandTotal,
        received_total: "0.00",
        balance_total: totals.grandTotal,
        notes: "Created from Direct Sale Billing workspace",
        lines: cart.map((line) => ({
          product: line.product.id,
          quantity: String(line.quantity),
          unit_price: line.unitPrice.toFixed(2),
          discount_amount: line.discountAmount.toFixed(2),
          taxable_value: (line.quantity * line.unitPrice).toFixed(2),
          gst_rate: "0.00",
          cgst_amount: "0.00",
          sgst_amount: "0.00",
          igst_amount: "0.00",
          line_total: (line.quantity * line.unitPrice).toFixed(2),
          description: line.product.name,
        })),
      });
      setMessage("Draft direct sale created successfully.");
      setCart([]);
      setPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create direct sale.");
    } finally {
      setBusySubmit(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-4">
        <h1 className="text-xl font-semibold">Direct Sale Billing</h1>
        <p className="text-sm text-muted-foreground">Zoho/Odoo style billing workspace with full-catalog product search and out-of-stock requirement preview.</p>
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.2fr_1.3fr_1fr]">
        <div className="rounded-2xl border bg-card p-4">
          <h2 className="font-medium">Customer Summary</h2>
          <p className="mt-2 text-sm text-muted-foreground">Customer selector and profile enrichment remain compatible with existing direct-sale service payloads.</p>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex gap-2">
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Search product, SKU, category..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="rounded-xl border px-3 py-2 text-sm" type="button" onClick={runSearch} disabled={loading}>{loading ? "Searching..." : "Search"}</button>
          </div>
          <div className="flex gap-2 text-xs">
            {(["all", "in_stock", "low_stock", "out_of_stock"] as const).map((value) => (
              <button key={value} className="rounded-xl border px-2 py-1 text-xs" type="button" onClick={() => setStockFilter(value)}>
                {value}
              </button>
            ))}
          </div>
          <div className="max-h-96 overflow-auto space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border p-3 flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.sku || row.product_code} · Available {row.inventory_status.available}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!row.inventory_status.is_in_stock ? (
                    <span className="text-xs rounded-full bg-amber-100 px-2 py-1 text-amber-700">OUT OF STOCK</span>
                  ) : null}
                  <button className="rounded-xl border px-2 py-1 text-xs" type="button" onClick={() => addProduct(row)}>Add</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="font-medium">Invoice Summary</h2>
          <p className="text-sm">Subtotal: {totals.subtotal}</p>
          <p className="text-sm">Grand total: {totals.grandTotal}</p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl border px-3 py-2 text-sm" type="button" onClick={openPreview} disabled={!cart.length}>Invoice Preview</button>
            <button className="rounded-xl border px-3 py-2 text-sm" type="button" onClick={submitDraft} disabled={!cart.length || busySubmit}>{busySubmit ? "Saving..." : "Save Draft"}</button>
          </div>
          {preview?.stock_warnings?.length ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-700">
              {preview.stock_warnings[0].message}
            </div>
          ) : null}
        </div>
      </section>
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-medium">Billing Cart</h2>
        <div className="mt-3 space-y-2">
          {cart.map((line) => (
            <div key={line.product.id} className="grid grid-cols-[1fr_120px_100px_120px] items-center gap-2 border-b py-2 text-sm">
              <div>{line.product.name}</div>
              <div>Qty {line.quantity}</div>
              <div>{line.unitPrice.toFixed(2)}</div>
              <div>{(line.quantity * line.unitPrice).toFixed(2)}</div>
            </div>
          ))}
          {!cart.length ? <p className="text-sm text-muted-foreground">No product in cart.</p> : null}
        </div>
      </section>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
