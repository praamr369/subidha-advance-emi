"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  ClipboardCheck,
  PackageSearch,
  ScrollText,
  Truck,
  Warehouse,
} from "lucide-react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import Phase7Guidance from "@/components/admin/workflow/Phase7Guidance";
import ERPErrorState from "@/components/erp/ERPErrorState";
import ERPLoadingState from "@/components/erp/ERPLoadingState";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import StatCard from "@/components/ui/StatCard";
import { ROUTES } from "@/lib/routes";
import { accountingDate, accountingErrorMessage } from "@/components/accounting/shared";
import {
  getStockSummary,
  listInventoryItems,
  listInventoryMovements,
  listStockAdjustments,
  listStockLocations,
  type StockAdjustment,
  type StockLedgerRow,
  type StockLocation,
  type StockSummaryRow,
} from "@/services/inventory";

const summaryColumns: EnterpriseColumnDef<StockSummaryRow>[] = [
  { key: "product_code", header: "Product" },
  { key: "sku", header: "SKU" },
  { key: "stock_item_type", header: "Stock Type", render: (row) => row.stock_item_type.replaceAll("_", " ") },
  {
    key: "default_stock_location_name",
    header: "Default Location",
    render: (row) => row.default_stock_location_name || "Unassigned",
  },
  { key: "on_hand_qty", header: "On Hand" },
  { key: "reserved_qty", header: "Reserved" },
  { key: "available_qty", header: "Available" },
  { key: "incoming_qty", header: "Incoming" },
  { key: "required_for_winners", header: "Winners Req" },
  { key: "required_for_confirmed_orders", header: "Confirmed Req" },
  { key: "reorder_level_qty", header: "Reorder" },
  {
    key: "is_below_reorder",
    header: "Alert",
    render: (row) =>
      row.is_below_reorder ? (
        <ERPStatusBadge status="PENDING" label="Reorder needed" />
      ) : (
        <ERPStatusBadge status="ACTIVE" label="Healthy" />
      ),
  },
];

const locationColumns: EnterpriseColumnDef<StockLocation>[] = [
  { key: "code", header: "Code" },
  { key: "name", header: "Name" },
  { key: "location_type", header: "Type" },
  {
    key: "is_active",
    header: "Status",
    render: (row) => <ERPStatusBadge status={row.is_active ? "ACTIVE" : "INACTIVE"} />,
  },
  { key: "notes", header: "Notes", render: (row) => row.notes?.trim() || "No notes" },
];

const bridgeColumns: EnterpriseColumnDef<StockLedgerRow>[] = [
  { key: "movement_date", header: "Date", render: (row) => accountingDate(row.movement_date) },
  { key: "product_code", header: "Product" },
  {
    key: "stock_location_name",
    header: "Location",
    render: (row) => row.stock_location_name || "Unassigned",
  },
  { key: "movement_type", header: "Movement" },
  { key: "reference_id", header: "Delivery Ref" },
  { key: "notes", header: "Notes", render: (row) => row.notes?.trim() || "No notes" },
];

export default function AdminInventoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [stockSummary, setStockSummary] = useState<StockSummaryRow[]>([]);
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [bridgeRows, setBridgeRows] = useState<StockLedgerRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      try {
        const [
          itemsPayload,
          summaryPayload,
          adjustmentPayload,
          locationPayload,
          bridgePayload,
        ] = await Promise.all([
          listInventoryItems(),
          getStockSummary(),
          listStockAdjustments(),
          listStockLocations(),
          listInventoryMovements({
            movement_type: "EMI_DELIVERY_OUT,EMI_RETURN_IN",
          }),
        ]);
        if (cancelled) return;
        setItemsCount(itemsPayload.count);
        setStockSummary(summaryPayload.results);
        setAdjustments(adjustmentPayload.results);
        setLocations(locationPayload.results);
        setBridgeRows(bridgePayload.results.slice(0, 8));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(accountingErrorMessage(err, "Failed to load inventory operations."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPage();
    return () => {
      cancelled = true;
    };
  }, []);

  const belowReorder = stockSummary.filter((row) => row.is_below_reorder).length;
  const draftAdjustments = adjustments.filter((row) => row.status === "DRAFT").length;
  const activeLocations = locations.filter((row) => row.is_active).length;
  const latestAdjustment = adjustments[0];
  const latestBridge = bridgeRows[0];

  return (
    <ERPPageShell
      title="Inventory Operations"
      subtitle="Operate stock as a separate ledger-backed module while keeping product master canonical and leaving EMI, payment, draw, waiver, and reconciliation truth unchanged."
      helperNote="Stock movement, delivery bridge, and adjustment queues stay explicit so inventory remains auditable and finance-safe."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory" },
      ]}
      statusBadge={{ label: "Admin Controlled", tone: "info" }}
      actions={[
        { href: ROUTES.admin.inventoryStockOnHand, label: "Stock on Hand", variant: "primary" },
        { href: ROUTES.admin.inventoryLocations, label: "Locations", variant: "secondary" },
        { href: ROUTES.admin.inventoryItems, label: "Items", variant: "secondary" },
        { href: ROUTES.admin.inventoryMovements, label: "Movements", variant: "secondary" },
        { href: ROUTES.admin.inventoryLedger, label: "Ledger", variant: "secondary" },
        { href: ROUTES.admin.inventoryDemandPlanning, label: "Demand Planning", variant: "secondary" },
        { href: ROUTES.admin.inventoryPurchaseNeeds, label: "Purchase Needs", variant: "secondary" },
        { href: ROUTES.admin.vendors, label: "Vendors", variant: "secondary" },
        { href: ROUTES.admin.purchases, label: "Purchases", variant: "secondary" },
        { href: ROUTES.admin.billingRegister, label: "Billing Register", variant: "secondary" },
        { href: ROUTES.admin.billingDirectSales, label: "Direct Sales", variant: "secondary" },
        { href: ROUTES.admin.inventoryAdjustments, label: "Adjustments", variant: "secondary" },
        { href: ROUTES.admin.inventoryOpeningStock, label: "Opening Stock", variant: "secondary" },
      ]}
      stats={[
        { label: "Tracked Items", value: String(itemsCount), tone: "info" },
        { label: "Active Locations", value: String(activeLocations), tone: "info" },
        { label: "Below Reorder", value: String(belowReorder), tone: belowReorder > 0 ? "warning" : "success" },
        { label: "Draft Adjustments", value: String(draftAdjustments), tone: draftAdjustments > 0 ? "warning" : "default" },
      ]}
    >
      {loading ? <ERPLoadingState label="Loading inventory operations..." /> : null}
      {!loading && error ? <ERPErrorState title="Inventory load failed" description={error} /> : null}

      {!loading && !error ? (
        <>
          <Phase7Guidance
            items={[
              {
                label: "Review Low Stock",
                href: `${ROUTES.admin.inventoryStockOnHand}?below_reorder=1`,
                note: "Check stock before creating delivery or direct-sale commitments.",
                warning: "Stock unavailable alerts must stay visible before delivery handoff.",
              },
              {
                label: "Post Stock Adjustment",
                href: ROUTES.admin.inventoryAdjustments,
                note: "Use adjustment workflow for audited stock corrections.",
              },
            ]}
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Tracked Items"
              value={String(itemsCount)}
              subtext="Inventory profiles linked to the live product master."
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label="Locations"
              value={String(activeLocations)}
              subtext="Store, warehouse, and showroom stock locations available to staff."
              icon={<Warehouse className="h-5 w-5" />}
              tone={activeLocations > 0 ? "success" : "warning"}
            />
            <StatCard
              label="Reorder Alerts"
              value={String(belowReorder)}
              subtext="Current stock at or below the configured reorder level."
              icon={<PackageSearch className="h-5 w-5" />}
              tone={belowReorder > 0 ? "warning" : "success"}
            />
            <StatCard
              label="Latest Delivery Bridge"
              value={latestBridge?.movement_type.replaceAll("_", " ") ?? "No bridge rows"}
              subtext={
                latestBridge
                  ? `${latestBridge.product_code} • ${accountingDate(latestBridge.movement_date)}`
                  : "Delivery-linked stock issue and return rows will surface here."
              }
              icon={<Truck className="h-5 w-5" />}
            />
          </div>

          <ERPSectionShell
            title="Stock Summary"
            description="Live stock is derived from the explicit stock ledger and opening balances, not from product pricing or subscription records."
          >
            <EnterpriseDataTable
              data={stockSummary}
              columns={summaryColumns}
              emptyTitle="No inventory items found"
              emptyDescription="Create inventory profiles for products that need stock tracking."
            />
          </ERPSectionShell>

          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <ERPSectionShell
              title="Location Master"
              description="Warehouses and store locations stay operationally separate from product and contract truth."
            >
              <EnterpriseDataTable
                data={locations}
                columns={locationColumns}
                emptyTitle="No stock locations found"
                emptyDescription="Create at least one active stock location before daily stock operations expand."
              />
            </ERPSectionShell>

            <ERPSectionShell
              title="Adjustment Queue"
              description="Draft adjustments remain non-operational until approved and posted."
            >
              <div className="grid gap-4">
                <StatCard
                  label="Draft Adjustments"
                  value={String(draftAdjustments)}
                  subtext="Draft rows still awaiting review."
                  icon={<ClipboardCheck className="h-5 w-5" />}
                  tone={draftAdjustments > 0 ? "warning" : "default"}
                />
                <StatCard
                  label="Latest Adjustment"
                  value={latestAdjustment?.adjustment_no ?? "No adjustments"}
                  subtext={
                    latestAdjustment
                      ? `${latestAdjustment.status} • ${accountingDate(latestAdjustment.adjustment_date)}`
                      : "Create a counted stock adjustment when physical stock differs from ledger stock."
                  }
                  icon={<ScrollText className="h-5 w-5" />}
                />
              </div>
            </ERPSectionShell>
          </div>

          <ERPSectionShell
            title="Delivery-Linked Stock Bridge"
            description="These rows show the safe inventory bridge from delivered and returned subscription deliveries into the stock ledger."
          >
            <EnterpriseDataTable
              data={bridgeRows}
              columns={bridgeColumns}
              emptyTitle="No delivery-linked stock movements found"
              emptyDescription="Delivered and returned subscription deliveries for bridge-enabled stock items will appear here."
            />
          </ERPSectionShell>
        </>
      ) : null}
    </ERPPageShell>
  );
}
