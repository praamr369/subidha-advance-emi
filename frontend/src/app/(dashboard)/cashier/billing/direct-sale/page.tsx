"use client";

import { useState } from "react";

import ERPAuditNote from "@/components/erp/ERPAuditNote";
import ERPDataToolbar from "@/components/erp/ERPDataToolbar";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPRegisterShell from "@/components/erp/ERPRegisterShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
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
    <ERPRegisterShell
      eyebrow="Cashier Counter"
      title="Direct Sale Billing"
      description="Fast catalog search with out-of-stock warning and requirement preview for front-desk operation."
    >
      <div className="flex flex-col gap-4">
        <ERPSectionShell title="Catalog search" description="Search by name, code, or SKU. Preview shows stock warnings returned by the cashier preview endpoint.">
          <ERPDataToolbar
            left={
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-foreground">Search</span>
                <input
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalog by name, code, SKU..."
                  enterKeyHint="search"
                  autoComplete="off"
                />
              </label>
            }
            right={
              <button
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-[var(--surface-card-elevated)] px-4 text-sm font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.74)] transition hover:border-[var(--surface-border-strong)] hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={search}
                disabled={loading}
              >
                {loading ? "Searching..." : "Search"}
              </button>
            }
          />

          {rows.length > 0 ? (
            <div className="max-h-[28rem] overflow-auto rounded-2xl border border-border/70 bg-[var(--surface-card-elevated)]">
              <div className="divide-y divide-border/80">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{row.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.sku || row.product_code} · Available {row.inventory_status.available}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {!row.inventory_status.is_in_stock ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                          Out of stock
                        </span>
                      ) : null}
                      <button
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-[var(--surface-muted)]"
                        type="button"
                        onClick={() => previewSingle(row)}
                      >
                        Preview
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ERPEmptyState title="Search to load products" description="Results will appear here. Use preview to see stock warnings before starting a direct-sale bill." />
          )}
        </ERPSectionShell>

        {preview?.stock_warnings?.length ? (
          <ERPAuditNote title="Stock warning" tone="warning">
            {preview.stock_warnings[0].message}
          </ERPAuditNote>
        ) : null}
      </div>
    </ERPRegisterShell>
  );
}
