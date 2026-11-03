"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Calculator, ExternalLink, Loader2, Package, ShoppingCart, Wrench, X } from "lucide-react";

import { formatDocumentMoney } from "@/lib/documents/formatters";
import {
  getStockOnHandCalculation,
  type StockOnHandCalculationDetail,
} from "@/services/inventory";

interface StockCalculationDrawerProps {
  itemId: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function StockCalculationDrawer({
  itemId,
  isOpen,
  onClose,
}: StockCalculationDrawerProps) {
  const [data, setData] = useState<StockOnHandCalculationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !itemId) return;

    let mounted = true;
    setLoading(true);
    setError(null);

    getStockOnHandCalculation(itemId)
      .then((res) => {
        if (!mounted) return;
        setData(res);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load stock calculation details.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, itemId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs font-sans">
      <div
        className="w-full max-w-2xl bg-background border-l border-border h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calculator className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Stock Math &amp; Calculation Audit
              </span>
              <h2 className="text-base font-bold text-foreground">
                {data ? data.product_name : "Loading Stock Details…"}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary" />
              <p className="text-sm">Calculating real-time ledger balance and movements…</p>
            </div>
          ) : error || !data ? (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
              {error || "Stock details could not be loaded."}
            </div>
          ) : (
            <>
              {/* Product Profile & Attribute Banner */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div>
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">SKU / Item Code</span>
                    <div className="font-mono text-sm font-bold text-foreground">{data.sku}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">Category</span>
                    <div className="text-sm font-semibold text-foreground">{data.category || "General"}</div>
                  </div>
                </div>

                {/* Variant Attributes Chips */}
                {data.attributes && Object.keys(data.attributes).length > 0 && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Variant Specifications
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(data.attributes).map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-700/50 px-2 py-0.5 text-xs text-amber-900 dark:text-amber-300 font-medium"
                        >
                          <strong className="font-semibold text-amber-950 dark:text-amber-200">{k}:</strong> {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price & Valuation Summary */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-xs">
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase">Standard Cost</span>
                    <strong className="font-mono text-foreground font-semibold">
                      {formatDocumentMoney(data.standard_cost)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase">Selling Price</span>
                    <strong className="font-mono text-foreground font-semibold">
                      {formatDocumentMoney(data.selling_price)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] block uppercase">Stock Value</span>
                    <strong className="font-mono text-primary font-bold">
                      {formatDocumentMoney(data.valuation_total)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Stock Formula Breakdown */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Mathematical Calculation Formula
                  </h3>
                  <span className="text-[10px] text-muted-foreground">Unit: {data.unit_of_measure}</span>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Opening */}
                  <div className="flex justify-between items-center py-1 border-b border-border/50">
                    <span className="text-muted-foreground">Opening Stock Quantity</span>
                    <span className="font-mono font-semibold text-foreground">
                      {parseFloat(data.calculation.opening_stock_qty).toFixed(2)}
                    </span>
                  </div>

                  {/* Total Inflows */}
                  <div className="bg-emerald-500/10 rounded-lg p-2.5 space-y-1">
                    <div className="flex justify-between items-center font-bold text-emerald-800 dark:text-emerald-300">
                      <span>(+) Total Inflows</span>
                      <span className="font-mono">+{parseFloat(data.calculation.total_inflows).toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-[11px] text-emerald-700/80 dark:text-emerald-400/80 pt-1 border-t border-emerald-500/20">
                      <span>Purchases / Inbound:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.inflows_breakdown.purchases).toFixed(2)}</span>
                      <span>Production Output:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.inflows_breakdown.production).toFixed(2)}</span>
                      <span>Returns In:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.inflows_breakdown.returns).toFixed(2)}</span>
                      <span>Adjustments In:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.inflows_breakdown.adjustments_in).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Total Outflows */}
                  <div className="bg-rose-500/10 rounded-lg p-2.5 space-y-1">
                    <div className="flex justify-between items-center font-bold text-rose-800 dark:text-rose-300">
                      <span>(−) Total Outflows</span>
                      <span className="font-mono">−{parseFloat(data.calculation.total_outflows).toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 text-[11px] text-rose-700/80 dark:text-rose-400/80 pt-1 border-t border-rose-500/20">
                      <span>Direct Sales Out:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.outflows_breakdown.direct_sales).toFixed(2)}</span>
                      <span>Deliveries / Handover:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.outflows_breakdown.deliveries).toFixed(2)}</span>
                      <span>Production Consumed:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.outflows_breakdown.production_consumption).toFixed(2)}</span>
                      <span>Adjustments Out:</span>
                      <span className="font-mono text-right">{parseFloat(data.calculation.outflows_breakdown.adjustments_out).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Physical Result */}
                  <div className="flex justify-between items-center py-2 border-t-2 border-border font-bold text-foreground">
                    <span>(=) Physical Stock on Hand (SOH)</span>
                    <span className="font-mono text-base">{parseFloat(data.calculation.physical_qty).toFixed(2)}</span>
                  </div>

                  {/* Reservations */}
                  <div className="flex justify-between items-center py-1 border-b border-border/50 text-amber-700 dark:text-amber-400">
                    <span>(−) Active Reservations / Soft Holds</span>
                    <span className="font-mono font-semibold">
                      −{parseFloat(data.calculation.reserved_qty).toFixed(2)}
                    </span>
                  </div>

                  {/* Available */}
                  <div className="flex justify-between items-center py-2 bg-primary/10 rounded-lg px-3 font-bold text-primary">
                    <span>(=) Available to Promise (ATP)</span>
                    <span className="font-mono text-base">{parseFloat(data.calculation.available_qty).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Recent Movements Section */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Recent Stock Movements ({data.recent_movements.length})
                  </h3>
                  <Link
                    href={`/admin/inventory/ledger?search=${encodeURIComponent(data.sku)}`}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
                  >
                    View All in Ledger <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {data.recent_movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    No movement records posted yet for this inventory profile.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60 max-h-60 overflow-y-auto">
                    {data.recent_movements.map((m) => {
                      const isQtyIn = parseFloat(m.quantity_in) > 0;
                      return (
                        <div key={m.id} className="py-2 flex items-center justify-between text-xs">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              {isQtyIn ? (
                                <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
                              )}
                              <span className="font-semibold text-foreground">{m.movement_type_display}</span>
                              {m.reference_id && (
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  #{m.reference_id}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{m.created_at}</div>
                          </div>

                          <div className="text-right">
                            <span
                              className={`font-mono font-bold block ${
                                isQtyIn ? "text-emerald-600" : "text-rose-600"
                              }`}
                            >
                              {isQtyIn ? `+${parseFloat(m.quantity_in).toFixed(2)}` : `−${parseFloat(m.quantity_out).toFixed(2)}`}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground block">
                              Bal: {m.running_balance}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            <Link
              href="/admin/inventory/adjustments"
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Wrench className="h-3.5 w-3.5" /> Adjust Stock
            </Link>
            <Link
              href="/admin/inventory/purchase-needs"
              className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-95"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Create PO / Need
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

