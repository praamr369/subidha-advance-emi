"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { EnterpriseColumnDef } from "@/components/enterprise/columns";
import EnterpriseDataTable from "@/components/enterprise/EnterpriseDataTable";
import { INVENTORY_CONTROL_DIRECTORY_GROUPS } from "@/components/admin/control-center/businessControlDirectories";
import { WorkspaceDirectory } from "@/components/admin/control-center/WorkspaceDirectory";
import ERPDetailGrid from "@/components/erp/ERPDetailGrid";
import ERPPageShell from "@/components/erp/ERPPageShell";
import ERPSectionShell from "@/components/erp/ERPSectionShell";
import ERPStatusBadge from "@/components/erp/ERPStatusBadge";
import { ROUTES } from "@/lib/routes";
import { accountingErrorMessage } from "@/components/accounting/shared";
import type { InventoryItem, StockLocation } from "@/services/inventory";
import {
  listInventoryItems,
  listStockLocations,
  updateInventoryItem,
} from "@/services/inventory";

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type ItemFormState = {
  default_stock_location: string;
  stock_item_type: InventoryItem["stock_item_type"];
  stock_tracking_enabled: boolean;
  delivery_stock_bridge_enabled: boolean;
  reorder_level_qty: string;
  standard_unit_cost: string;
  is_active: boolean;
};

function toFormState(item: InventoryItem): ItemFormState {
  return {
    default_stock_location: item.default_stock_location ? String(item.default_stock_location) : "",
    stock_item_type: item.stock_item_type,
    stock_tracking_enabled: item.stock_tracking_enabled,
    delivery_stock_bridge_enabled: item.delivery_stock_bridge_enabled,
    reorder_level_qty: item.reorder_level_qty,
    standard_unit_cost: item.standard_unit_cost ?? "",
    is_active: item.is_active,
  };
}

export default function InventoryItemsPage() {
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadPage() {
    setLoading(true);
    try {
      const [itemsPayload, locationPayload] = await Promise.all([
        listInventoryItems(),
        listStockLocations({ is_active: 1 }),
      ]);
      setRows(itemsPayload.results);
      setLocations(locationPayload.results);
      setError(null);
    } catch (err) {
      setRows([]);
      setLocations([]);
      setError(accountingErrorMessage(err, "Failed to load inventory items."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage();
  }, []);

  useEffect(() => {
    if (!rows.length) {
      setSelectedItemId(null);
      setForm(null);
      return;
    }

    const current = rows.find((row) => row.id === selectedItemId) ?? rows[0];
    if (current.id !== selectedItemId) {
      setSelectedItemId(current.id);
    }
    setForm(toFormState(current));
  }, [rows, selectedItemId]);

  const selectedItem = useMemo(
    () => rows.find((row) => row.id === selectedItemId) ?? null,
    [rows, selectedItemId]
  );

  const rawMaterialCount = rows.filter((row) => row.stock_item_type === "RAW_MATERIAL").length;
  const bridgeEnabledCount = rows.filter((row) => row.delivery_stock_bridge_enabled).length;

  const columns: EnterpriseColumnDef<InventoryItem>[] = [
    { key: "product_code", header: "Product Code" },
    { key: "product_name", header: "Product" },
    { key: "sku", header: "SKU" },
    {
      key: "stock_item_type",
      header: "Stock Type",
      render: (row) => row.stock_item_type.replaceAll("_", " "),
    },
    {
      key: "default_stock_location_name",
      header: "Default Location",
      render: (row) => row.default_stock_location_name || "Unassigned",
    },
    { key: "current_stock_qty", header: "On Hand" },
    { key: "reorder_level_qty", header: "Reorder" },
    {
      key: "delivery_stock_bridge_enabled",
      header: "Delivery Bridge",
      render: (row) => (
        <ERPStatusBadge
          status={row.delivery_stock_bridge_enabled ? "ACTIVE" : "INACTIVE"}
          label={row.delivery_stock_bridge_enabled ? "Enabled" : "Disabled"}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedItemId(row.id);
              setMessage(null);
              setError(null);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Edit
          </button>
          <Link
            href={`/admin/inventory/items/${row.id}`}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Open detail
          </Link>
        </div>
      ),
    },
  ];

  async function handleSave() {
    if (!selectedItem || !form) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateInventoryItem(selectedItem.id, {
        default_stock_location: form.default_stock_location ? Number(form.default_stock_location) : null,
        stock_item_type: form.stock_item_type,
        stock_tracking_enabled: form.stock_tracking_enabled,
        delivery_stock_bridge_enabled: form.delivery_stock_bridge_enabled,
        reorder_level_qty: form.reorder_level_qty,
        standard_unit_cost: form.standard_unit_cost.trim() ? form.standard_unit_cost : null,
        is_active: form.is_active,
      });
      await loadPage();
      setMessage("Inventory profile updated.");
    } catch (err) {
      setError(accountingErrorMessage(err, "Failed to update inventory profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ERPPageShell
      eyebrow="Inventory Master Control"
      title="Inventory Items"
      subtitle="Govern stock-tracked product profiles from inventory without redefining the canonical product master."
      helperNote="Inventory item profiles control stock behavior only. Product pricing, billing, and EMI contract semantics remain outside this workspace."
      helperTone="info"
      breadcrumbs={[
        { label: "Admin", href: ROUTES.admin.dashboard },
        { label: "Inventory", href: ROUTES.admin.inventory },
        { label: "Items" },
      ]}
      actions={[
        { href: ROUTES.admin.inventoryLocations, label: "Locations", variant: "secondary" },
        { href: ROUTES.admin.inventoryStockOnHand, label: "Stock On Hand", variant: "primary" },
      ]}
      stats={[
        { label: "Tracked Items", value: rows.length, tone: "info" },
        { label: "Raw-Material Ready", value: rawMaterialCount, tone: rawMaterialCount > 0 ? "warning" : "default" },
        { label: "Delivery Bridge Enabled", value: bridgeEnabledCount, tone: "success" },
      ]}
      statusBadge={{ label: "Profile Governance", tone: "info" }}
    >
      {/* Phase 9B-NF7C — Object detail cockpit: Inventory & Stock item source
          ownership. Additive copy only. Per-item /inventory/items/[id] detail
          is now available as a read-only drill-down. No stock movement,
          valuation, or ledger row is created from page load — quantities are
          read from the stock-on-hand and ledger views. */}
      <section className="rounded-2xl border border-border bg-muted/30 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Inventory & Stock · Stock source workflow
        </p>
        <h2 className="mt-2 text-base font-semibold text-foreground">
          This is the Inventory & Stock — Item source. Stock source workflow truth is read from real backend stock state; this page governs item profile fields only and creates no stock movement, valuation, or ledger row on load.
        </h2>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          {[
            "Stock on hand",
            "Available",
            "Reserved",
            "Delivery out",
            "Adjustment",
            "Purchase receipt",
            "Return/hold/maintenance",
          ].map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 font-medium"
            >
              {label}
            </span>
          ))}
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <li className="rounded-xl border border-border bg-background px-3 py-2">
            Vendor purchase/payable belongs to Purchases & Vendors.
          </li>
          <li className="rounded-xl border border-border bg-background px-3 py-2">
            Accounting bridge belongs to Accounting & Reconciliation.
          </li>
        </ul>
      </section>

      <WorkspaceDirectory
        title="Inventory route map"
        description="Move between stock masters, live stock review, movement registers, valuation, and counted-stock workflows from one inventory control surface."
        groups={INVENTORY_CONTROL_DIRECTORY_GROUPS}
      />

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <ERPSectionShell
        title="Tracked Inventory Profiles"
        description="Use the inventory workspace to govern stock-only fields such as location, reorder controls, and delivery bridge participation."
      >
        <EnterpriseDataTable
          data={rows}
          columns={columns}
          loading={loading}
          error={error}
          emptyTitle="No inventory items are configured"
          emptyDescription="Prepare inventory profiles from the product workspace for stock-tracked products."
        />
      </ERPSectionShell>

      <ERPSectionShell
        title="Selected Item Governance"
        description="Catalog identity stays on Product. This form controls only stock-facing behavior for the selected inventory profile."
      >
        {selectedItem && form ? (
          <div className="space-y-5">
            <ERPDetailGrid
              columns={4}
              items={[
                { label: "Product", value: selectedItem.product_name || "—" },
                { label: "Product Code", value: selectedItem.product_code || "—" },
                { label: "SKU", value: selectedItem.sku || "—" },
                { label: "Unit", value: selectedItem.unit_of_measure || "PCS" },
              ]}
            />

            <div className="grid gap-4 xl:grid-cols-2">
              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">Default Stock Location</span>
                <select
                  value={form.default_stock_location}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, default_stock_location: event.target.value }
                        : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                >
                  <option value="">Unassigned</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} - {location.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">Stock Item Type</span>
                <select
                  value={form.stock_item_type}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            stock_item_type: event.target.value as InventoryItem["stock_item_type"],
                          }
                        : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                >
                  <option value="FINISHED_GOOD">Finished Good</option>
                  <option value="ACCESSORY">Accessory</option>
                  <option value="RAW_MATERIAL">Raw Material</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">Reorder Level</span>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={form.reorder_level_qty}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, reorder_level_qty: event.target.value } : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                />
              </label>

              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">Standard Unit Cost</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.standard_unit_cost}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, standard_unit_cost: event.target.value } : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.stock_tracking_enabled}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, stock_tracking_enabled: event.target.checked }
                        : current
                    )
                  }
                  disabled={saving}
                />
                Stock tracking enabled
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.delivery_stock_bridge_enabled}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, delivery_stock_bridge_enabled: event.target.checked }
                        : current
                    )
                  }
                  disabled={saving}
                />
                Delivery bridge enabled
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, is_active: event.target.checked } : current
                    )
                  }
                  disabled={saving}
                />
                Inventory profile active
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Inventory Governance"}
              </button>
              <button
                type="button"
                onClick={() => selectedItem && setForm(toFormState(selectedItem))}
                disabled={saving || !selectedItem}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an inventory item from the register to govern its stock-facing settings.
          </p>
        )}
      </ERPSectionShell>
    </ERPPageShell>
  );
}
