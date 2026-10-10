"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";

import { accountingDate } from "@/components/accounting/shared";
import { listStockLedger, type StockLedgerResult } from "@/services/inventory";

export default function StockLedgerPanel({ productId }: { productId?: number }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<StockLedgerResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listStockLedger({ 
        inventory_item_id: productId,
      });
      setData(res.results);
    } catch (err) {
      setError("Failed to load stock history.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

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
    return <div className="p-4 text-sm text-muted-foreground">No stock history recorded yet.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            <th className="px-4 py-3 font-medium text-muted-foreground">Date</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Movement Type</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Reference</th>
            <th className="px-4 py-3 font-medium text-muted-foreground">Location</th>
            <th className="px-4 py-3 font-medium text-right text-emerald-600">Qty In</th>
            <th className="px-4 py-3 font-medium text-right text-rose-600">Qty Out</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((row) => (
            <tr key={row.id} className="transition-colors hover:bg-muted/10">
              <td className="px-4 py-3 whitespace-nowrap">{accountingDate(row.movement_date) || "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center rounded bg-muted/50 px-2 py-0.5 text-[11px] font-medium tracking-wide">
                  {row.movement_type.replaceAll("_", " ")}
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {row.reference_model && row.reference_id ? (
                  <span className="font-mono text-xs">{row.reference_model} #{row.reference_id}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{row.stock_location || "—"}</td>
              <td className="px-4 py-3 text-right font-medium text-emerald-600 tabular-nums">
                {parseFloat(row.quantity_in) > 0 ? `+${parseFloat(row.quantity_in)}` : "—"}
              </td>
              <td className="px-4 py-3 text-right font-medium text-rose-600 tabular-nums">
                {parseFloat(row.quantity_out) > 0 ? `-${parseFloat(row.quantity_out)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
