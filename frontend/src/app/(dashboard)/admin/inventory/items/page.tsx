"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

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
import QRLabelPrintModal from "@/components/inventory/QRLabelPrintModal";
import type { QRLabelItem } from "@/components/inventory/QRLabelPrintModal";

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-4 text-sm outline-none transition focus:border-ring disabled:cursor-not-allowed disabled:opacity-60";

type ItemFormState = {
  default_stock_location: string;
  stock_item_type: InventoryItem["stock_item_type"];
  stock_tracking_enabled: boolean;
  delivery_stock_bridge_enabled: boolean;
  reorder_level_qty: string;
  standard_unit_cost: string;
  barcode: string;
  qr_code: string;
  lot_tracking_enabled: boolean;
  expiry_tracking_enabled: boolean;
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
    barcode: item.barcode ?? "",
    qr_code: item.qr_code ?? "",
    lot_tracking_enabled: Boolean(item.lot_tracking_enabled),
    expiry_tracking_enabled: Boolean(item.expiry_tracking_enabled),
    is_active: item.is_active,
  };
}

type StockHealth = "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK" | "NOT_TRACKED";

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Derived on the client from on-hand vs reorder level. Creates no stock movement. */
function stockHealthOf(item: InventoryItem): StockHealth {
  if (!item.stock_tracking_enabled) return "NOT_TRACKED";
  const onHand = toNum(item.current_stock_qty);
  const reorder = toNum(item.reorder_level_qty);
  if (onHand <= 0) return "OUT_OF_STOCK";
  if (reorder > 0 && onHand <= reorder) return "LOW_STOCK";
  return "IN_STOCK";
}

function stockValueOf(item: InventoryItem): number {
  return toNum(item.current_stock_qty) * toNum(item.standard_unit_cost);
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const QTY = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });

const HEALTH_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All stock" },
  { value: "OUT_OF_STOCK", label: "Out of stock" },
  { value: "LOW_STOCK", label: "Below reorder" },
  { value: "IN_STOCK", label: "In stock" },
  { value: "NOT_TRACKED", label: "Not tracked" },
];

export default function InventoryItemsPage() {
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [form, setForm] = useState<ItemFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [printItem, setPrintItem] = useState<QRLabelItem | null>(null);
  const [healthFilter, setHealthFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortBy, setSortBy] = useState("attention");

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

  const bridgeEnabledCount = rows.filter((row) => row.delivery_stock_bridge_enabled).length;

  const healthByItemId = useMemo(() => {
    const map = new Map<number, StockHealth>();
    rows.forEach((row) => map.set(row.id, stockHealthOf(row)));
    return map;
  }, [rows]);

  const outOfStockCount = useMemo(
    () => rows.filter((row) => healthByItemId.get(row.id) === "OUT_OF_STOCK").length,
    [rows, healthByItemId]
  );
  const lowStockCount = useMemo(
    () => rows.filter((row) => healthByItemId.get(row.id) === "LOW_STOCK").length,
    [rows, healthByItemId]
  );
  const totalStockValue = useMemo(
    () => rows.reduce((sum, row) => sum + stockValueOf(row), 0),
    [rows]
  );

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (healthFilter && healthByItemId.get(row.id) !== healthFilter) return false;
      if (typeFilter && row.stock_item_type !== typeFilter) return false;
      if (locationFilter) {
        if (locationFilter === "UNASSIGNED") {
          if (row.default_stock_location) return false;
        } else if (String(row.default_stock_location ?? "") !== locationFilter) {
          return false;
        }
      }
      return true;
    });

    const healthRank: Record<StockHealth, number> = {
      OUT_OF_STOCK: 0,
      LOW_STOCK: 1,
      IN_STOCK: 2,
      NOT_TRACKED: 3,
    };

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortBy === "on_hand_asc") return toNum(a.current_stock_qty) - toNum(b.current_stock_qty);
      if (sortBy === "on_hand_desc") return toNum(b.current_stock_qty) - toNum(a.current_stock_qty);
      if (sortBy === "value_desc") return stockValueOf(b) - stockValueOf(a);
      if (sortBy === "name") {
        return (a.product_name || "").localeCompare(b.product_name || "");
      }
      // "attention" — worst stock health first, then lowest cover ratio.
      const rankDelta =
        healthRank[healthByItemId.get(a.id) ?? "NOT_TRACKED"] -
        healthRank[healthByItemId.get(b.id) ?? "NOT_TRACKED"];
      if (rankDelta !== 0) return rankDelta;
      return toNum(a.current_stock_qty) - toNum(b.current_stock_qty);
    });
    return sorted;
  }, [rows, healthFilter, typeFilter, locationFilter, sortBy, healthByItemId]);

  function exportVisibleCsv() {
    const header = [
      "Product Code",
      "Product",
      "SKU",
      "Stock Type",
      "Default Location",
      "On Hand",
      "Unit",
      "Reorder Level",
      "Stock Health",
      "Unit Cost",
      "Stock Value",
      "Delivery Bridge",
    ];
    const lines = visibleRows.map((row) =>
      [
        row.product_code ?? "",
        row.product_name ?? "",
        row.sku ?? "",
        row.stock_item_type ?? "",
        row.default_stock_location_name || "Unassigned",
        toNum(row.current_stock_qty),
        row.unit_of_measure ?? "",
        toNum(row.reorder_level_qty),
        healthByItemId.get(row.id) ?? "",
        toNum(row.standard_unit_cost),
        stockValueOf(row).toFixed(2),
        row.delivery_stock_bridge_enabled ? "Enabled" : "Disabled",
      ]
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `inventory-items-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const columns: EnterpriseColumnDef<InventoryItem>[] = [
    {
      key: "product_name",
      header: "Item",
      searchable: true,
      cellClassName: "min-w-[220px]",
      render: (row) => (
        <div className="leading-tight">
          <div className="font-medium text-foreground">{row.product_name || "—"}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {row.product_code || "—"}
            {row.sku && row.sku !== row.product_code ? ` · ${row.sku}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "current_stock_qty",
      header: "Stock Position",
      headerClassName: "text-right",
      cellClassName: "text-right whitespace-nowrap",
      render: (row) => {
        const health = healthByItemId.get(row.id) ?? "NOT_TRACKED";
        const onHand = toNum(row.current_stock_qty);
        const reorder = toNum(row.reorder_level_qty);
        const toneClass =
          health === "OUT_OF_STOCK"
            ? "text-destructive"
            : health === "LOW_STOCK"
              ? "text-amber-600"
              : health === "NOT_TRACKED"
                ? "text-muted-foreground"
                : "text-foreground";
        return (
          <div className="leading-tight">
            <div className={`text-base font-semibold tabular-nums ${toneClass}`}>
              {health === "NOT_TRACKED" ? "—" : QTY.format(onHand)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                {row.unit_of_measure || "PCS"}
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {reorder > 0 ? `reorder at ${QTY.format(reorder)}` : "no reorder level"}
            </div>
          </div>
        );
      },
    },
    {
      key: "stock_health",
      header: "Status",
      render: (row) => {
        const health = healthByItemId.get(row.id) ?? "NOT_TRACKED";
        return <ERPStatusBadge status={health} />;
      },
    },
    {
      key: "stock_value",
      header: "Stock Value",
      headerClassName: "text-right",
      cellClassName: "text-right whitespace-nowrap tabular-nums",
      render: (row) => {
        const cost = toNum(row.standard_unit_cost);
        if (!cost) return <span className="text-muted-foreground">no cost set</span>;
        return (
          <div className="leading-tight">
            <div className="font-medium text-foreground">{INR.format(stockValueOf(row))}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              @ {INR.format(cost)}
            </div>
          </div>
        );
      },
    },
    {
      key: "default_stock_location_name",
      header: "Location",
      searchable: true,
      render: (row) =>
        row.default_stock_location_name ? (
          <span className="text-foreground">{row.default_stock_location_name}</span>
        ) : (
          <span className="text-amber-600">Unassigned</span>
        ),
    },
    {
      key: "stock_item_type",
      header: "Type",
      render: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.stock_item_type?.replaceAll("_", " ") ?? "—"}
        </span>
      ),
    },
    {
      key: "barcode",
      header: "Trace",
      searchable: true,
      render: (row) =>
        row.lot_tracking_enabled ? (
          <span className="text-xs">
            {`Lots ${row.active_lot_count ?? 0}`}
            {toNum(row.expiring_lot_count) > 0 ? (
              <span className="ml-1 text-amber-600">{`· ${row.expiring_lot_count} expiring`}</span>
            ) : null}
          </span>
        ) : row.barcode || row.qr_code ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {row.barcode || row.qr_code}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not tracked</span>
        ),
    },
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
            onClick={(event) => {
              event.stopPropagation();
              setSelectedItemId(row.id);
              setMessage(null);
              setError(null);
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setPrintItem({
                productName: row.product_name ?? "—",
                productCode: row.product_code ?? "",
                sku: row.sku ?? undefined,
                qrValue: row.qr_code?.trim() || row.sku || row.product_code || String(row.id),
                unitOfMeasure: row.unit_of_measure ?? undefined,
              });
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            Print QR
          </button>
          <Link
            href={`/admin/inventory/items/${row.id}`}
            onClick={(event) => event.stopPropagation()}
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
        barcode: form.barcode.trim() ? form.barcode : null,
        qr_code: form.qr_code.trim() ? form.qr_code : null,
        lot_tracking_enabled: form.lot_tracking_enabled,
        expiry_tracking_enabled: form.expiry_tracking_enabled,
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
        {
          label: "Out of Stock",
          value: outOfStockCount,
          tone: outOfStockCount > 0 ? "danger" : "success",
        },
        {
          label: "Below Reorder",
          value: lowStockCount,
          tone: lowStockCount > 0 ? "warning" : "success",
        },
        { label: "Stock Value", value: INR.format(totalStockValue), tone: "default" },
        { label: "Delivery Bridge Enabled", value: bridgeEnabledCount, tone: "success" },
      ]}
      statusBadge={{ label: "Profile Governance", tone: "info" }}
    >
      {/* Phase 9B-NF7C — Object detail cockpit: Inventory & Stock item source
          ownership. Additive copy only. Per-item /inventory/items/[id] detail
          is now available as a read-only drill-down. No stock movement,
          valuation, or ledger row is created from page load — quantities are
          read from the stock-on-hand and ledger views. */}
      <section className="rounded-xl border border-border bg-muted/30 p-5">
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
        description="Stock health is derived from on-hand against each item's reorder level. Click any row to load it into the governance form below."
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {HEALTH_FILTERS.map((option) => {
            const isActive = healthFilter === option.value;
            const count =
              option.value === ""
                ? rows.length
                : rows.filter((row) => healthByItemId.get(row.id) === option.value).length;
            return (
              <button
                key={option.value || "all"}
                type="button"
                aria-pressed={isActive}
                onClick={() => setHealthFilter(option.value)}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                ].join(" ")}
              >
                {option.label}
                <span
                  className={[
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <EnterpriseDataTable
          data={visibleRows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={() => void loadPage()}
          pageSize={50}
          globalFilterPlaceholder="Search name, code, SKU, barcode, location..."
          onRowClick={(row) => {
            setSelectedItemId(row.id);
            setMessage(null);
            setError(null);
          }}
          rowClassName={(row) =>
            row.id === selectedItemId ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : undefined
          }
          emptyTitle="No items match these filters"
          emptyDescription="Clear the stock, type, or location filter to see the full inventory register."
          toolbar={
            <>
              <select
                aria-label="Filter by stock type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All types</option>
                <option value="FINISHED_GOOD">Finished Good</option>
                <option value="ACCESSORY">Accessory</option>
                <option value="RAW_MATERIAL">Raw Material</option>
              </select>
              <select
                aria-label="Filter by default location"
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
              >
                <option value="">All locations</option>
                <option value="UNASSIGNED">Unassigned</option>
                {locations.map((location) => (
                  <option key={location.id} value={String(location.id)}>
                    {location.code} — {location.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sort records"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none transition focus:border-ring"
              >
                <option value="attention">Sort: Needs attention first</option>
                <option value="on_hand_asc">Sort: On hand (low → high)</option>
                <option value="on_hand_desc">Sort: On hand (high → low)</option>
                <option value="value_desc">Sort: Stock value (high → low)</option>
                <option value="name">Sort: Product name (A → Z)</option>
              </select>
              <button
                type="button"
                onClick={exportVisibleCsv}
                disabled={visibleRows.length === 0}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            </>
          }
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

              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">Barcode</span>
                <input
                  value={form.barcode}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, barcode: event.target.value } : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                />
              </label>

              <label className="grid gap-2 text-sm text-foreground">
                <span className="font-medium">QR Code</span>
                <input
                  value={form.qr_code}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, qr_code: event.target.value } : current
                    )
                  }
                  disabled={saving}
                  className={FIELD_CLASS}
                />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
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
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
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
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.lot_tracking_enabled}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, lot_tracking_enabled: event.target.checked }
                        : current
                    )
                  }
                  disabled={saving}
                />
                Lot tracking enabled
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.expiry_tracking_enabled}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, expiry_tracking_enabled: event.target.checked }
                        : current
                    )
                  }
                  disabled={saving}
                />
                Expiry tracking enabled
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
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

      {printItem && (
        <QRLabelPrintModal item={printItem} onClose={() => setPrintItem(null)} />
      )}
    </ERPPageShell>
  );
}
