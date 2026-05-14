"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import PortalPage from "@/components/ui/PortalPage";
import { ROUTES } from "@/lib/routes";
import {
  getInventoryProfile,
  type InventoryProfileDetail,
  type InventoryProfileManufacturingCost,
  type InventoryProfileStockByLocation,
  getInventoryProfileManufacturingCost,
  getInventoryProfileStockByLocation,
} from "@/services/inventory";

export default function InventoryProfileDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [profile, setProfile] = useState<InventoryProfileDetail | null>(null);
  const [stock, setStock] = useState<InventoryProfileStockByLocation | null>(null);
  const [mfg, setMfg] = useState<InventoryProfileManufacturingCost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [profilePayload, stockPayload, mfgPayload] = await Promise.all([
          getInventoryProfile(id),
          getInventoryProfileStockByLocation(id),
          getInventoryProfileManufacturingCost(id),
        ]);
        setProfile(profilePayload);
        setStock(stockPayload);
        setMfg(mfgPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <PortalPage
      title={profile ? `${profile.product_name} Inventory Profile` : "Inventory Profile"}
      subtitle="Profile controls stock behavior and costing metadata; quantity changes must use stock workflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Profiles", href: ROUTES.admin.inventoryProfiles },
        { label: id || "Detail" },
      ]}
    >
      {loading ? <div className="text-sm text-muted-foreground">Loading profile...</div> : null}
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {!loading && !error && profile ? (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-border p-4">
            <div>Inventory ID: {profile.inventory_code || "—"}</div>
            <div>SKU: {profile.sku || "—"}</div>
            <div>Product Code: {profile.product_code}</div>
            <div>Status: {profile.stock_tracking_status}</div>
            <div>Base/Sale Price Ref: {profile.product_base_price}</div>
            <div>Purchase Cost: {profile.purchase_unit_cost || "—"}</div>
            <div>Standard Cost: {profile.standard_unit_cost || "—"}</div>
            <div>Margin Preview: {profile.margin_preview || "—"}</div>
          </div>
          <div className="rounded-xl border border-border p-4">
            <div>Warehouse Qty: {stock?.warehouse_qty || "0.000"}</div>
            <div>Showroom Qty: {stock?.showroom_qty || "0.000"}</div>
            <div>Total On Hand: {stock?.total_on_hand_qty || "0.000"}</div>
            <div>Reserved: {stock?.reserved_qty || "0.000"}</div>
            <div>Available: {stock?.available_qty || "0.000"}</div>
            <div>Last Movement: {stock?.last_movement_date || "—"}</div>
            {(stock?.total_on_hand_qty || "0.000") === "0.000" ? (
              <div className="mt-2 text-amber-700">No stock yet. Use Opening Stock to post real quantity.</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border p-4">
            <div>Raw Material Cost: {mfg?.raw_material_cost || "0.00"}</div>
            <div>Labour Cost: {mfg?.labour_cost || "0.00"}</div>
            <div>Overhead Cost: {mfg?.overhead_cost || "0.00"}</div>
            <div>Total Estimated Cost: {mfg?.total_estimated_manufacturing_cost || "0.00"}</div>
            <div>Finished Goods Output Qty: {mfg?.finished_goods_output_qty || "1.000"}</div>
            <div>BOM: {mfg?.bom_no || "Not linked"}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={ROUTES.admin.inventoryOpeningStock} className="rounded-xl border border-border px-3 py-2">Open Opening Stock</Link>
            <Link href={ROUTES.admin.inventoryAdjustments} className="rounded-xl border border-border px-3 py-2">Create Stock Adjustment</Link>
            <Link href={ROUTES.admin.inventoryLedger} className="rounded-xl border border-border px-3 py-2">View Stock Ledger</Link>
            <Link href={`/admin/products/${profile.product}`} className="rounded-xl border border-border px-3 py-2">View Product Master</Link>
            <Link href={ROUTES.admin.manufacturingBoms} className="rounded-xl border border-border px-3 py-2">View Manufacturing/BOM</Link>
          </div>
          <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs">
            Stock quantity is not editable on this page by design. Use controlled stock flows for auditable quantity changes.
          </p>
        </div>
      ) : null}
    </PortalPage>
  );
}
