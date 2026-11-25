"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

import { accountingDate, accountingMoney } from "@/components/accounting/shared";
import { listStockLedger, type StockLedgerKPIS, type StockLedgerResult } from "@/services/inventory";

export default function StockLedgerPanel({ productId, search, title = "Stock Ledger" }: { productId?: number; search?: string; title?: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockLedgerResult[]>([]);
  const [summary, setSummary] = useState<StockLedgerKPIS | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listStockLedger({ 
        inventory_item_id: productId,
        search,
        page_size: 100,
      });
      setData(res.results);
      setSummary(res.summary ?? null);
    } catch (err) {
      setError("Failed to load stock history.");
    } finally {
      setLoading(false);
    }
  }, [productId, search]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-sm text-destructive">{error}</div>;
  }

  if (data.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No stock history recorded yet for this product.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="text-sm font-semibold">{title}</div>
        {summary && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">
              Total Cost: <strong className="text-foreground tabular-nums">{accountingMoney(summary.page_total_cost || "0")}</strong>
            </span>
            <span className="rounded-md bg-muted/60 px-2 py-0.5 text-muted-foreground">
              Selling Value: <strong className="text-foreground tabular-nums">{accountingMoney(summary.page_total_selling || "0")}</strong>
            </span>
            <span className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${
              Number(summary.page_net_profit || 0) >= 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            }`}>
              Net Profit: {accountingMoney(summary.page_net_profit || "0")} ({Number(summary.page_margin_percent || 0).toFixed(2)}%)
            </span>
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-3 py-3 font-medium text-muted-foreground">Date</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">SKU / Item</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">Movement</th>
            <th className="px-3 py-3 font-medium text-right text-emerald-600">In</th>
            <th className="px-3 py-3 font-medium text-right text-rose-600">Out</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Prod Cost</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Acc Cost</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Total Cost</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Selling Price</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Net Profit</th>
            <th className="px-3 py-3 font-medium text-right text-muted-foreground">Margin %</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">Reference</th>
            <th className="px-3 py-3 font-medium text-muted-foreground">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => {
            const netVal = Number(row.net_profit ?? 0);
            const marginPct = Number(row.profit_margin_percent ?? 0);
            return (
            <tr key={row.id} className="transition-colors hover:bg-muted/10">
              <td className="px-3 py-3 whitespace-nowrap">{accountingDate(row.movement_date) || "—"}</td>
              <td className="px-3 py-3">
                <div className="font-mono text-xs font-semibold">{row.sku || row.product_code || "—"}</div>
                {row.product_name && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[220px]" title={row.product_name}>
                    {row.product_name}
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <span className="inline-flex items-center rounded bg-muted/50 px-2 py-0.5 text-[11px] font-medium tracking-wide">
                  {row.movement_type.replaceAll("_", " ")}
                </span>
              </td>
              <td className="px-3 py-3 text-right font-medium text-emerald-600 tabular-nums">
                {parseFloat(row.quantity_in) > 0 ? `+${parseFloat(row.quantity_in)}` : "—"}
              </td>
              <td className="px-3 py-3 text-right font-medium text-rose-600 tabular-nums">
                {parseFloat(row.quantity_out) > 0 ? `-${parseFloat(row.quantity_out)}` : "—"}
              </td>
              <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                {accountingMoney(row.product_cost || "0")}
              </td>
              <td className="px-3 py-3 text-right text-xs tabular-nums text-muted-foreground">
                {Number(row.accessories_cost || 0) > 0 ? (
                  <span title={`All attached accessories cost: ${accountingMoney(row.all_accessories_cost || "0")}`}>
                    {accountingMoney(row.accessories_cost || "0")}
                  </span>
                ) : "₹0.00"}
              </td>
              <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums">
                {accountingMoney(row.total_cost || "0")}
              </td>
              <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-primary">
                {accountingMoney(row.selling_price || "0")}
              </td>
              <td className={`px-3 py-3 text-right text-xs font-semibold tabular-nums ${netVal >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
                {netVal >= 0 ? "+" : ""}{accountingMoney(row.net_profit || "0")}
              </td>
              <td className="px-3 py-3 text-right text-xs font-semibold tabular-nums">
                <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] ${
                  Number(row.selling_price || 0) <= 0
                    ? "bg-muted text-muted-foreground"
                    : marginPct >= 0
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                }`}>
                  {Number(row.selling_price || 0) > 0 ? `${marginPct.toFixed(2)}%` : "—"}
                </span>
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                {row.reference_model && row.reference_id ? (
                  <span className="font-mono text-xs">{row.reference_model} #{row.reference_id}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-3 text-muted-foreground">{row.stock_location || "—"}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
