"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import { listInventoryProfiles, type InventoryProfileRow } from "@/services/inventory";

export default function InventoryProfilesPage() {
  const [rows, setRows] = useState<InventoryProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const payload = await listInventoryProfiles();
        setRows(payload.results || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inventory profiles.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PortalPage
      title="Inventory Profiles"
      subtitle="Product catalog entries become stock-trackable only after profile preparation."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Profiles" },
      ]}
    >
      <div className="space-y-3">
        <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          Stock quantity is read-only here. Use Opening Stock, Goods Receipt, Stock Adjustment, Sale/Delivery, Return, or Manufacturing Receipt workflows to change real stock.
        </p>
        {loading ? <div className="text-sm text-muted-foreground">Loading inventory profiles...</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        {!loading && !error && rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No inventory profiles yet. Prepare from Product Detail.</div>
        ) : null}
        {!loading && !error && rows.length > 0 ? (
          <div className="grid gap-3">
            {rows.map((row) => (
              <Link key={row.id} href={`${ROUTES.admin.inventoryProfiles}/${row.id}`} className="rounded-xl border border-border px-4 py-3 hover:bg-muted/40">
                <div className="text-sm font-medium">{row.product_name} ({row.product_code})</div>
                <div className="text-xs text-muted-foreground">
                  Inventory ID: {row.inventory_code || "—"} | SKU: {row.sku || "—"} | Status: {row.stock_tracking_status || "—"}
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </PortalPage>
  );
}
