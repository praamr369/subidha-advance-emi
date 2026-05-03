"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PageHeader from "@/components/ui/PageHeader";
import { ROUTES } from "@/lib/routes";
import { listStockNeeds } from "@/services/inventory-ops";

type Row = Record<string, unknown>;

export default function StockNeedsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [count, setCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    listStockNeeds({ limit: "100" })
      .then((payload) => {
        if (!mounted) return;
        const p = payload as { results?: Row[]; count?: number };
        setRows(p.results ?? []);
        setCount(typeof p.count === "number" ? p.count : (p.results ?? []).length);
        setError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load stock needs.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock needs"
        description="Operational purchase/stock needs (PurchaseNeed). Mutations require admin privileges."
      />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryReadiness}>
          Readiness
        </Link>
        <Link className="rounded-full border border-border px-3 py-1 hover:bg-muted" href={ROUTES.admin.inventoryPurchaseNeeds}>
          Purchase needs (legacy workspace)
        </Link>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
      {error ? (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      ) : null}

      {!loading && !error ? (
        <div className="text-sm text-muted-foreground">
          Showing {rows.length} of {count} record(s).
        </div>
      ) : null}

      {!loading && rows.length === 0 && !error ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No stock needs returned.</div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Need</th>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-left font-medium">Shortage</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.need_no ?? r.id)}</td>
                  <td className="px-3 py-2">{String(r.product_name_snapshot ?? r.product ?? "—")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.shortage_quantity ?? "—")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.status ?? "—")}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{String(r.source_module ?? r.source_type ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
