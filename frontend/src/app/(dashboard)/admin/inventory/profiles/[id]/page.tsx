"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPEmptyState from "@/components/erp/ERPEmptyState";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
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
    <ERPPageShell
      eyebrow="Inventory"
      title={profile ? `${profile.product_name} Inventory Profile` : "Inventory Profile"}
      subtitle="Profile controls stock behavior and costing metadata; quantity changes must use stock workflows."
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Profiles", href: ROUTES.admin.inventoryProfiles },
        { label: id || "Detail" },
      ]}
      statusBadge={profile?.stock_tracking_status ? { label: profile.stock_tracking_status, tone: "info" } : undefined}
    >
      {loading ? <ERPLoadingState label="Loading inventory profile..." /> : null}
      {!loading && error ? <ERPErrorState title="Unable to load inventory profile" description={error} /> : null}
      {!loading && !error && !profile ? (
        <ERPEmptyState title="Inventory profile not found" description="This profile is unavailable or you do not have access." />
      ) : null}

      {!loading && !error && profile ? (
        <>
          <ERPSectionShell
            title="Profile Summary"
            description="Stock behavior and costing metadata only. Quantity mutations must flow through controlled stock workflows."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <ERPStatusBadge status={profile.stock_tracking_status} label={profile.stock_tracking_status} />
              </div>
            }
          >
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "Inventory ID", value: profile.inventory_code || "—" },
                { label: "SKU", value: profile.sku || "—" },
                { label: "Product Code", value: profile.product_code || "—" },
                { label: "Base/Sale Price Ref", value: profile.product_base_price || "—" },
                { label: "Purchase Cost", value: profile.purchase_unit_cost || "—" },
                { label: "Standard Cost", value: profile.standard_unit_cost || "—" },
                { label: "Margin Preview", value: profile.margin_preview || "—" },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell
            title="Stock Snapshot"
            description="Read-only stock quantities by operational location."
            footer={
              (stock?.total_on_hand_qty || "0.000") === "0.000" ? (
                <div className="text-sm text-amber-900 dark:text-amber-100">
                  No stock yet. Use Opening Stock to post real quantity.
                </div>
              ) : null
            }
          >
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "Warehouse Qty", value: stock?.warehouse_qty || "0.000" },
                { label: "Showroom Qty", value: stock?.showroom_qty || "0.000" },
                { label: "Total On Hand", value: stock?.total_on_hand_qty || "0.000" },
                { label: "Reserved", value: stock?.reserved_qty || "0.000" },
                { label: "Available", value: stock?.available_qty || "0.000" },
                { label: "Last Movement", value: stock?.last_movement_date || "—" },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell title="Manufacturing Cost (Estimate)" description="Read-only cost basis for manufacturing reporting.">
            <ERPDetailGrid
              columns={3}
              items={[
                { label: "Raw Material Cost", value: mfg?.raw_material_cost || "0.00" },
                { label: "Labour Cost", value: mfg?.labour_cost || "0.00" },
                { label: "Overhead Cost", value: mfg?.overhead_cost || "0.00" },
                { label: "Total Estimated Cost", value: mfg?.total_estimated_manufacturing_cost || "0.00" },
                { label: "Finished Goods Output Qty", value: mfg?.finished_goods_output_qty || "1.000" },
                { label: "BOM", value: mfg?.bom_no || "Not linked" },
              ]}
            />
          </ERPSectionShell>

          <ERPSectionShell title="Actions" description="Open controlled stock workflows and linked masters.">
            <div className="flex flex-wrap gap-2">
              <Link href={ROUTES.admin.inventoryOpeningStock} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Open Opening Stock
              </Link>
              <Link href={ROUTES.admin.inventoryAdjustments} className="workspace-pill px-3 py-2 text-xs font-semibold">
                Create Stock Adjustment
              </Link>
              <Link href={ROUTES.admin.inventoryLedger} className="workspace-pill px-3 py-2 text-xs font-semibold">
                View Stock Ledger
              </Link>
              <Link href={`/admin/products/${profile.product}`} className="workspace-pill px-3 py-2 text-xs font-semibold">
                View Product Master
              </Link>
              <Link href={ROUTES.admin.manufacturingBoms} className="workspace-pill px-3 py-2 text-xs font-semibold">
                View Manufacturing/BOM
              </Link>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
              Stock quantity is not editable on this page by design. Use controlled stock flows for auditable quantity changes.
            </div>
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
