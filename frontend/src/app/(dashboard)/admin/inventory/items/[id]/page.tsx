"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { getInventoryItem, type InventoryItem } from "@/services/inventory";

export default function InventoryItemDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        setItem(await getInventoryItem(id));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load inventory item.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <ERPPageShell
      eyebrow="Inventory"
      title={item ? `${item.product_name} Inventory Item` : "Inventory Item"}
      subtitle="Per-item stock controls, reorder posture, and delivery bridge status. Quantity mutations still flow through controlled stock workflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Items", href: ROUTES.admin.inventoryItems },
        { label: id || "Detail" },
      ]}
      statusBadge={item ? { label: item.is_active ? "Active" : "Inactive", tone: item.is_active ? "success" : "default" } : undefined}
    >
      {loading ? <ERPLoadingState label="Loading inventory item..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load inventory item" description={error} /> : null}
      {!loading && !error && !item ? (
        <ERPEmptyState title="Inventory item not found" description="This item is unavailable or you do not have access." />
      ) : null}

      {!loading && !error && item ? (
        <>
          <ERPSectionShell
            title="Item summary"
            description="Item-level stock behavior only. Product master, pricing, and accounting bridge remain separate control surfaces."
          >
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "Inventory ID", value: String(item.id) },
                { label: "Product", value: item.product_name || "—" },
                { label: "Product Code", value: item.product_code || "—" },
                { label: "SKU", value: item.sku || "—" },
                { label: "Unit", value: item.unit_of_measure || "—" },
                { label: "Current Stock", value: item.current_stock_qty || "0.000" },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell
            title="Stock controls"
            description="These controls govern stock tracking, delivery bridge participation, and reorder posture."
            actions={<ERPStatusBadge status={item.stock_tracking_enabled ? "ACTIVE" : "INACTIVE"} label={item.stock_tracking_enabled ? "Stock tracked" : "Stock not tracked"} />}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Stock item type</div>
                <div className="mt-1 text-sm font-semibold">{item.stock_item_type.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Delivery bridge</div>
                <div className="mt-1 text-sm font-semibold">{item.delivery_stock_bridge_enabled ? "Enabled" : "Disabled"}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Opening stock</div>
                <div className="mt-1 text-sm font-semibold">{item.opening_stock_qty}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Reorder level</div>
                <div className="mt-1 text-sm font-semibold">{item.reorder_level_qty}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Valuation method</div>
                <div className="mt-1 text-sm font-semibold">{item.valuation_method}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Standard cost</div>
                <div className="mt-1 text-sm font-semibold">{item.standard_unit_cost || "—"}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Default location</div>
                <div className="mt-1 text-sm font-semibold">{item.default_stock_location_name || "Unassigned"}</div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="text-xs font-semibold uppercase text-muted-foreground">Active</div>
                <div className="mt-1 text-sm font-semibold">{item.is_active ? "Yes" : "No"}</div>
              </div>
            </div>
          </ERPSectionShell>

          <ERPSectionShell title="Related routes" description="Open the linked master and stock-control views for this item.">
            <div className="flex flex-wrap gap-2">
              <Link href={ROUTES.admin.inventoryItems} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Back to Items
              </Link>
              <Link href={ROUTES.admin.inventoryStockOnHand} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Open Stock On Hand
              </Link>
              <Link href={ROUTES.admin.inventoryLedger} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Open Stock Ledger
              </Link>
              <Link href={`/admin/products/${item.product}`} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Open Product Master
              </Link>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              Inventory item detail is read-only here. Stock changes must flow through opening stock, adjustments, receipts, or movement workflows.
            </div>
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
